import { t, type Dictionary } from "intlayer";

const engineRegistrationStatusContent = {
  key: "engineRegistrationStatus",
  content: {
    loading: t({ en: "Loading…", fr: "Chargement…", vi: "Đang tải…" }),
    linkInvalid: t({
      en: "This status link is invalid or has expired.",
      fr: "Ce lien de statut est invalide ou a expiré.",
      vi: "Liên kết trạng thái này không hợp lệ hoặc đã hết hạn.",
    }),
    metaTitle: t({
      en: "Registration status",
      fr: "Statut de l'inscription",
      vi: "Trạng thái đăng ký",
    }),
    metaDescription: t({
      en: "View your event registration, payment status, and check-in QR code.",
      fr: "Consultez votre inscription, le paiement et le code QR de pointage.",
      vi: "Xem đăng ký, trạng thái thanh toán và mã QR điểm danh.",
    }),
    eyebrow: t({
      en: "Registration status",
      fr: "Statut de l'inscription",
      vi: "Trạng thái đăng ký",
    }),
    heading: t({ en: "Your registration", fr: "Votre inscription", vi: "Đăng ký của bạn" }),
    intro: t({
      en: "Keep this page for your records and event check-in.",
      fr: "Conservez cette page pour vos dossiers et le pointage.",
      vi: "Giữ trang này để tra cứu và điểm danh sự kiện.",
    }),
    paymentConfirmed: t({
      en: "Payment confirmed",
      fr: "Paiement confirmé",
      vi: "Đã xác nhận thanh toán",
    }),
    paymentPending: t({
      en: "Payment pending",
      fr: "Paiement en attente",
      vi: "Đang chờ thanh toán",
    }),
    noPaymentRequired: t({
      en: "No payment required",
      fr: "Aucun paiement requis",
      vi: "Không cần thanh toán",
    }),
    event: t({ en: "Event", fr: "Événement", vi: "Sự kiện" }),
    fullName: t({ en: "Name", fr: "Nom", vi: "Họ tên" }),
    registrationId: t({ en: "Registration ID", fr: "Identifiant d'inscription", vi: "Mã đăng ký" }),
    tickets: t({ en: "Tickets", fr: "Billets", vi: "Vé" }),
    amountDue: t({ en: "Amount due", fr: "Montant dû", vi: "Số tiền cần trả" }),
    amountPaid: t({ en: "Amount paid", fr: "Montant payé", vi: "Số tiền đã trả" }),
    paymentMethod: t({
      en: "Payment method",
      fr: "Mode de paiement",
      vi: "Phương thức thanh toán",
    }),
    paymentDate: t({ en: "Confirmed", fr: "Confirmé", vi: "Đã xác nhận" }),
    paymentNote: t({ en: "Payment note", fr: "Note de paiement", vi: "Ghi chú thanh toán" }),
    cash: t({ en: "Cash", fr: "Comptant", vi: "Tiền mặt" }),
    etransfer: t({ en: "e-Transfer", fr: "Virement Interac", vi: "Chuyển khoản" }),
    paymentInstructions: t({
      en: "Payment instructions",
      fr: "Instructions de paiement",
      vi: "Hướng dẫn thanh toán",
    }),
    etransferInstruction: t({
      en: "Send your e-Transfer to",
      fr: "Envoyez votre virement à",
      vi: "Gửi chuyển khoản đến",
    }),
    cashInstruction: t({
      en: "Pay in person at",
      fr: "Payez en personne à",
      vi: "Thanh toán trực tiếp tại",
    }),
    noPaymentInstructions: t({
      en: "Payment instructions have not been configured. Contact the organizer.",
      fr: "Les instructions de paiement ne sont pas configurées. Contactez l'organisateur.",
      vi: "Chưa có hướng dẫn thanh toán. Vui lòng liên hệ ban tổ chức.",
    }),
    qrTitle: t({ en: "Check-in QR code", fr: "Code QR de pointage", vi: "Mã QR điểm danh" }),
    qrHelp: t({
      en: "Show this code at the event entrance.",
      fr: "Présentez ce code à l'entrée de l'événement.",
      vi: "Xuất trình mã này tại cửa vào sự kiện.",
    }),
    qrPending: t({
      en: "Your QR code will appear after payment is confirmed by staff.",
      fr: "Votre code QR apparaîtra après confirmation du paiement par l'équipe.",
      vi: "Mã QR sẽ xuất hiện sau khi nhân viên xác nhận thanh toán.",
    }),
    checkedIn: t({ en: "Checked in", fr: "Pointé", vi: "Đã điểm danh" }),
    notCheckedIn: t({ en: "Not checked in", fr: "Non pointé", vi: "Chưa điểm danh" }),
    checkedInAt: t({ en: "Checked in at", fr: "Pointé à", vi: "Điểm danh lúc" }),
    backToEvent: t({ en: "Back to event", fr: "Retour à l'événement", vi: "Quay lại sự kiện" }),
    backToEvents: t({ en: "Back to events", fr: "Retour aux événements", vi: "Quay lại sự kiện" }),
    findAnother: t({
      en: "Find another registration",
      fr: "Trouver une autre inscription",
      vi: "Tìm đăng ký khác",
    }),
    accessTitle: t({
      en: "Find your registration",
      fr: "Trouver votre inscription",
      vi: "Tìm đăng ký của bạn",
    }),
    accessIntro: t({
      en: "Enter your registration ID and the email used for the registration. We will send a short verification code.",
      fr: "Saisissez votre identifiant d'inscription et le courriel utilisé. Nous enverrons un court code de vérification.",
      vi: "Nhập mã đăng ký và email đã dùng khi đăng ký. Chúng tôi sẽ gửi mã xác minh ngắn.",
    }),
    emailLabel: t({
      en: "Email used for registration",
      fr: "Courriel utilisé",
      vi: "Email đã dùng",
    }),
    requestCode: t({ en: "Send verification code", fr: "Envoyer le code", vi: "Gửi mã xác minh" }),
    codeLabel: t({ en: "Verification code", fr: "Code de vérification", vi: "Mã xác minh" }),
    verifyCode: t({ en: "Open status page", fr: "Ouvrir le statut", vi: "Mở trang trạng thái" }),
    codeSent: t({
      en: "If those details match, a verification code was sent to the registration email.",
      fr: "Si ces informations correspondent, un code a été envoyé au courriel de l'inscription.",
      vi: "Nếu thông tin khớp, mã xác minh đã được gửi đến email đăng ký.",
    }),
    codeRateLimited: t({
      en: "Please wait a minute before requesting another code.",
      fr: "Veuillez attendre une minute avant de demander un autre code.",
      vi: "Vui lòng chờ một phút trước khi yêu cầu mã mới.",
    }),
    codeUnavailable: t({
      en: "The verification email could not be sent. Contact the organizer.",
      fr: "Le courriel de vérification n'a pas pu être envoyé. Contactez l'organisateur.",
      vi: "Không thể gửi email xác minh. Vui lòng liên hệ ban tổ chức.",
    }),
    codeInvalid: t({
      en: "The code is invalid or expired.",
      fr: "Le code est invalide ou expiré.",
      vi: "Mã không hợp lệ hoặc đã hết hạn.",
    }),
    codeLocked: t({
      en: "Too many attempts. Request a new code later.",
      fr: "Trop de tentatives. Demandez un nouveau code plus tard.",
      vi: "Quá nhiều lần thử. Hãy yêu cầu mã mới sau.",
    }),
    emailMismatch: t({
      en: "Enter the email address used for this registration.",
      fr: "Saisissez le courriel utilisé pour cette inscription.",
      vi: "Nhập email đã dùng cho đăng ký này.",
    }),
  },
} satisfies Dictionary;

export default engineRegistrationStatusContent;
