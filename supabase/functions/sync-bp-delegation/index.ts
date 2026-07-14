import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BITRIX_WEBHOOK_URL = Deno.env.get("BITRIX_WEBHOOK_URL")!;
const BITRIX_SP_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_SP_ENTITY_TYPE_ID"));
const BITRIX_BP_TEMPLATE_ID = Number(Deno.env.get("BITRIX_BP_TEMPLATE_ID") || 0);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function bitrixCall(method: string, params: Record<string, unknown>) {
  const url = `${BITRIX_WEBHOOK_URL.replace(/\/$/, "")}/${method}.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Bitrix REST error ${method}: ${data.error_description || data.error || response.status}`,
    );
  }

  return data.result;
}

function extractItemId(documentId: unknown): number | null {
  const raw = Array.isArray(documentId)
    ? documentId.join("_")
    : String(documentId ?? "");

  const dynamicMatch = raw.match(/DYNAMIC[_:](\d+)[_:](\d+)/i);

  if (dynamicMatch) {
    const entityTypeId = Number(dynamicMatch[1]);
    const itemId = Number(dynamicMatch[2]);

    if (entityTypeId === BITRIX_SP_ENTITY_TYPE_ID) {
      return itemId;
    }
  }

  const numbers = raw.match(/\d+/g);

  if (!numbers || numbers.length === 0) {
    return null;
  }

  return Number(numbers[numbers.length - 1]);
}

function normalizeObservers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "number") return item;
      if (typeof item === "string") return Number(item);

      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        return Number(obj.id ?? obj.ID ?? obj.userId ?? obj.USER_ID);
      }

      return 0;
    })
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function addObserverToSmartProcess(itemId: number, userId: number) {
  const getResult = await bitrixCall("crm.item.get", {
    entityTypeId: BITRIX_SP_ENTITY_TYPE_ID,
    id: itemId,
  });

  const item = getResult.item ?? getResult;
  const currentObservers = normalizeObservers(item.observers);

  if (currentObservers.includes(userId)) {
    return "already_exists";
  }

  await bitrixCall("crm.item.update", {
    entityTypeId: BITRIX_SP_ENTITY_TYPE_ID,
    id: itemId,
    fields: {
      observers: [...currentObservers, userId],
    },
  });

  return "added";
}

async function getActiveBizprocTasks() {
  const tasks: any[] = [];
  let start: number | undefined = 0;

  while (start !== undefined) {
    const result = await bitrixCall("bizproc.task.list", {
      select: [
        "ID",
        "USER_ID",
        "STATUS",
        "WORKFLOW_ID",
        "WORKFLOW_TEMPLATE_ID",
        "DOCUMENT_ID",
        "NAME",
      ],
      filter: {
        STATUS: 0,
      },
      order: {
        ID: "DESC",
      },
      start,
    });

    const portion = Array.isArray(result.tasks)
      ? result.tasks
      : Array.isArray(result)
        ? result
        : [];

    tasks.push(...portion);

    start = typeof result.next === "number" ? result.next : undefined;
  }

  return tasks;
}

serve(async () => {
  const report = {
    entityTypeId: BITRIX_SP_ENTITY_TYPE_ID,
    bpTemplateId: BITRIX_BP_TEMPLATE_ID,
    scanned: 0,
    created: 0,
    delegated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    if (!BITRIX_WEBHOOK_URL || !BITRIX_SP_ENTITY_TYPE_ID) {
      throw new Error("Не заполнены BITRIX_WEBHOOK_URL или BITRIX_SP_ENTITY_TYPE_ID");
    }

    const tasks = await getActiveBizprocTasks();
    report.scanned = tasks.length;

    for (const task of tasks) {
      try {
        const taskId = Number(task.ID);
        const currentUserId = Number(task.USER_ID);
        const workflowTemplateId = Number(task.WORKFLOW_TEMPLATE_ID || 0);
        const itemId = extractItemId(task.DOCUMENT_ID);

        if (
          BITRIX_BP_TEMPLATE_ID > 0 &&
          workflowTemplateId !== BITRIX_BP_TEMPLATE_ID
        ) {
          report.skipped++;
          continue;
        }

        if (!taskId || !currentUserId || !itemId) {
          report.skipped++;
          continue;
        }

        // Всегда добавляем текущего исполнителя активного задания в наблюдатели.
        await addObserverToSmartProcess(itemId, currentUserId);

        const { data: existing, error: selectError } = await supabase
          .from("bp_task_delegation_watch")
          .select("*")
          .eq("task_id", taskId)
          .maybeSingle();

        if (selectError) {
          throw selectError;
        }

        if (!existing) {
        // Сразу добавляем текущего исполнителя задания в наблюдатели.
        // Это важно, если Supabase впервые увидел задание уже после делегирования.
        await addObserverToSmartProcess(itemId, currentUserId);

        const { error: insertError } = await supabase
          .from("bp_task_delegation_watch")
          .insert({
        task_id: taskId,
          workflow_id: task.WORKFLOW_ID ?? null,
          workflow_template_id: workflowTemplateId,
          document_id: JSON.stringify(task.DOCUMENT_ID ?? null),

           entity_type_id: BITRIX_SP_ENTITY_TYPE_ID,
           item_id: itemId,

            initial_user_id: currentUserId,
            current_user_id: currentUserId,

           task_name: task.NAME ?? null,
           status: Number(task.STATUS),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
         }

        report.created++;
         continue;
        }

        if (Number(existing.current_user_id) !== currentUserId) {
          await addObserverToSmartProcess(itemId, currentUserId);

          const { error: updateError } = await supabase
            .from("bp_task_delegation_watch")
            .update({
              current_user_id: currentUserId,
              delegated_user_id: currentUserId,
              delegated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("task_id", taskId);

          if (updateError) {
            throw updateError;
          }

          report.delegated++;
        }
      } catch (taskError) {
        report.errors.push(
          taskError instanceof Error ? taskError.message : String(taskError),
        );
      }
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          report,
        },
        null,
        2,
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});