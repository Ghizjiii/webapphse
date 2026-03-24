import { CheckCircle2, Shield } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { CompanySection } from '../features/public-form/company-section';
import { ParticipantsSection } from '../features/public-form/participants-section';
import { StatusPage } from '../features/public-form/status-page';
import { usePublicFormController } from '../features/public-form/use-public-form-controller';

export default function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const controller = usePublicFormController(token);

  if (controller.linkStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (controller.linkStatus === 'submitted' || controller.submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Анкета отправлена!</h1>
          <p className="text-gray-500 leading-relaxed">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 py-10 px-4" onClick={() => controller.setOpenCourseSelect(null)}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Регистрация на обучение</h1>
          <p className="text-slate-300 mt-2">Заполните форму для записи сотрудников на курсы</p>
        </div>

        <form onSubmit={controller.handleSubmit} className="space-y-6">
          <CompanySection
            companyName={controller.companyName}
            companyPhone={controller.companyPhone}
            companyEmail={controller.companyEmail}
            companyBin={controller.companyBin}
            companyCity={controller.companyCity}
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
            openCourseSelect={controller.openCourseSelect}
            courseSearch={controller.courseSearch}
            errors={controller.errors}
            canFillParticipants={controller.canFillParticipants}
            canEditParticipants={controller.canEditParticipants}
            totalCourses={controller.totalCourses}
            totalCourseRequests={controller.totalCourseRequests}
            pageSize={controller.pageSize}
            currentPage={controller.currentPage}
            totalPages={controller.totalPages}
            filteredCourses={controller.filteredCourses}
            fileInputRefs={controller.fileInputRefs}
            onPageSizeChange={controller.handlePageSizeChange}
            onPageChange={controller.setCurrentPage}
            onParticipantFieldChange={controller.updateParticipant}
            onParticipantPhotoPick={(participantId, file) => {
              void controller.handlePhotoSelect(participantId, file);
            }}
            onToggleCourse={controller.toggleCourse}
            onOpenCourseSelectChange={controller.setOpenCourseSelect}
            onCourseSearchChange={controller.setCourseSearch}
            onRemoveParticipant={controller.removeParticipant}
            onAddParticipant={controller.addParticipant}
          />

          <div className="pb-6">
            <button
              type="submit"
              disabled={controller.submitting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-2xl text-base transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {controller.submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Отправляем...
                </>
              ) : 'Отправить анкету'}
            </button>
            <p className="text-center text-slate-400 text-xs mt-3">
              После отправки данные будут переданы координатору обучения
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
