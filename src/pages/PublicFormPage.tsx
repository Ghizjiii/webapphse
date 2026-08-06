import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import ConfirmModal from '../components/ConfirmModal';
import DevelopedByFooter from '../components/DevelopedByFooter';
import { CompanySection } from '../features/public-form/company-section';
import { ParticipantsSection } from '../features/public-form/participants-section';
import { StatusPage } from '../features/public-form/status-page';
import { usePublicFormController } from '../features/public-form/use-public-form-controller';

export default function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const controller = usePublicFormController(token);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.submitting) return;
    if (!controller.validateForm()) return;
    setShowSubmitConfirm(true);
  }

  async function handleConfirmSubmit() {
    await controller.submitQuestionnaire();
    setShowSubmitConfirm(false);
  }

  if (controller.linkStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (controller.linkStatus === 'submitted' || controller.submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Анкета отправлена!</h1>
          <p className="leading-relaxed text-gray-500">
            Ваши данные успешно сохранены. Координатор свяжется с вами для подтверждения.
          </p>
        </div>
      </div>
    );
  }

  if (controller.linkStatus === 'expired') {
    return <StatusPage icon="clock" title="Срок действия ссылки истек" desc="Обратитесь к координатору для получения новой ссылки." />;
  }

  if (controller.linkStatus === 'inactive') {
    return <StatusPage icon="lock" title="Ссылка деактивирована" desc="Данная ссылка была деактивирована. Обратитесь к координатору." />;
  }

  if (controller.linkStatus === 'invalid') {
    return <StatusPage icon="error" title="Ссылка недействительна" desc="Проверьте правильность ссылки или обратитесь к координатору." />;
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-4 sm:py-10"
      translate="no"
      onClick={() => controller.setOpenCourseSelect(null)}
    >
      <div className="mx-auto w-full max-w-[1760px]">
        <div className="mb-8 text-center">
          <BrandLogo variant="light" className="mx-auto mb-5 h-24 w-36 object-contain" />
          <h1 className="text-3xl font-bold text-white">Регистрация на обучение</h1>
          <p className="mt-2 text-slate-300">Заполните форму для записи сотрудников на курсы</p>
        </div>

        <form onSubmit={handleSubmitRequest} className="space-y-6">
          <CompanySection
            paymentOrderOptional={controller.paymentOrderOptional}
            companyName={controller.companyName}
            companyPhone={controller.companyPhone}
            companyEmail={controller.companyEmail}
            companyBin={controller.companyBin}
            companyCity={controller.companyCity}
            companyComments={controller.companyComments}
            directoryMatch={controller.directoryMatch}
            lookupLoading={controller.lookupLoading}
            lookupTouched={controller.lookupTouched}
            noContractConfirmed={controller.noContractConfirmed}
            paymentOrderUrl={controller.paymentOrderUrl}
            paymentOrderName={controller.paymentOrderName}
            paymentOrderNumber={controller.paymentOrderNumber}
            paymentOrderDate={controller.paymentOrderDate}
            paymentOrderAmount={controller.paymentOrderAmount}
            paymentAutofillHint={controller.paymentAutofillHint}
            paymentBeneficiaryHint={controller.paymentBeneficiaryHint}
            uploadingPaymentOrder={controller.uploadingPaymentOrder}
            paymentOrderStage={controller.paymentOrderStage}
            errors={controller.errors}
            lockCompanyFields={controller.lockCompanyFields}
            canConfirmNoContract={controller.canConfirmNoContract}
            hasActiveContract={controller.hasActiveContract}
            paymentStagePercent={controller.paymentStagePercent}
            paymentStageLabel={controller.paymentStageLabel}
            paymentOrderInputRef={controller.paymentOrderInputRef}
            onCompanyNameChange={controller.setCompanyName}
            onCompanyPhoneChange={controller.setCompanyPhone}
            onCompanyEmailChange={controller.setCompanyEmail}
            onCompanyBinChange={controller.handleCompanyBinChange}
            onCompanyCityChange={controller.setCompanyCity}
            onCompanyCommentsChange={controller.setCompanyComments}
            onLookupCompany={controller.handleLookupCompany}
            onEnableCompanyCreateMode={controller.enableCompanyCreateMode}
            onNoContractConfirmedChange={controller.setNoContractConfirmed}
            onPaymentOrderPick={file => {
              void controller.handlePaymentOrderSelect(file);
            }}
            onPaymentOrderNumberChange={controller.setPaymentOrderNumber}
            onPaymentOrderDateChange={controller.setPaymentOrderDate}
            onPaymentOrderAmountChange={controller.setPaymentOrderAmount}
          />

          <ParticipantsSection
            participants={controller.participants}
            pagedParticipants={controller.pagedParticipants}
            availableCategories={controller.availableCategories}
            availableElectricalSafetyGroups={controller.availableElectricalSafetyGroups}
            openCourseSelect={controller.openCourseSelect}
            courseSearch={controller.courseSearch}
            errors={controller.errors}
            participantImportMessage={controller.participantImportMessage}
            photoRequired={controller.photoRequired}
            canFillParticipants={controller.canFillParticipants}
            canEditParticipants={controller.canEditParticipants}
            totalCourses={controller.totalCourses}
            totalCourseRequests={controller.totalCourseRequests}
            pageSize={controller.pageSize}
            currentPage={controller.currentPage}
            totalPages={controller.totalPages}
            getFilteredCourses={controller.getFilteredCoursesForParticipant}
            fileInputRefs={controller.fileInputRefs}
            onPageSizeChange={controller.handlePageSizeChange}
            onPageChange={controller.setCurrentPage}
            onParticipantFieldChange={controller.updateParticipant}
            onParticipantPhotoPick={(participantId, file) => {
              void controller.handlePhotoSelect(participantId, file);
            }}
            onToggleCourse={controller.toggleCourse}
            onPreviousElectricalSafetyGroupChange={controller.updatePreviousElectricalSafetyGroup}
            onOpenCourseSelectChange={controller.setOpenCourseSelect}
            onCourseSearchChange={controller.setCourseSearch}
            onRemoveParticipant={controller.removeParticipant}
            onAddParticipant={controller.addParticipant}
            onParticipantsFileImport={file => {
              void controller.importParticipantsFromFile(file);
            }}
          />

          <div className="pb-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:flex-row sm:items-center">
              <div className="text-sm text-slate-200">
                Проверьте, что все сотрудники добавлены и заполнены корректно. После отправки анкета будет передана координатору обучения.
              </div>
              <button
                type="submit"
                disabled={controller.submitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:ml-auto sm:min-w-[220px]"
              >
                {controller.submitting ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Отправляем...
                  </>
                ) : 'Отправить анкету'}
              </button>
            </div>
            <p className="mt-3 text-right text-xs text-slate-400">
              После отправки данные будут переданы координатору обучения
            </p>
          </div>
        </form>
        <DevelopedByFooter theme="dark" className="mt-6" />
      </div>

      {showSubmitConfirm && (
        <ConfirmModal
          title="Отправить анкету?"
          message="Проверьте, что вы добавили всех сотрудников и заполнили их данные. После подтверждения анкета будет отправлена координатору."
          confirmLabel={controller.submitting ? 'Отправляем...' : 'Отправить'}
          confirmDisabled={controller.submitting}
          cancelDisabled={controller.submitting}
          onConfirm={() => {
            void handleConfirmSubmit();
          }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}
    </div>
  );
}
