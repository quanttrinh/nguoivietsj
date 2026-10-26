import { t, type Dictionary } from "intlayer";

const engineCheckinContent = {
  key: "engineCheckin",
  content: {
    metaTitle: t({
      en: "Check-in · Event engine",
      fr: "Pointage · Moteur d'événements",
      vi: "Điểm danh · Hệ thống sự kiện",
    }),
    eyebrow: t({ en: "Check-in", fr: "Pointage", vi: "Điểm danh" }),
    intro: t({
      en: "Scan registration QR codes or enter a registration ID manually.",
      fr: "Scannez les codes QR d'inscription ou saisissez un identifiant manuellement.",
      vi: "Quét mã QR đăng ký hoặc nhập mã đăng ký thủ công.",
    }),
    scannerTitle: t({ en: "QR scanner", fr: "Lecteur de QR", vi: "Máy quét QR" }),
    scannerHelp: t({
      en: "Allow camera access, then point the camera at the registration QR code.",
      fr: "Autorisez l'accès à la caméra, puis pointez-la vers le code QR d'inscription.",
      vi: "Cho phép truy cập camera, sau đó hướng camera vào mã QR đăng ký.",
    }),
    startCamera: t({ en: "Start camera", fr: "Démarrer la caméra", vi: "Bật camera" }),
    stopCamera: t({ en: "Stop camera", fr: "Arrêter la caméra", vi: "Tắt camera" }),
    cameraError: t({
      en: "Could not start the camera. Use manual entry instead.",
      fr: "Impossible de démarrer la caméra. Utilisez la saisie manuelle.",
      vi: "Không thể bật camera. Vui lòng nhập thủ công.",
    }),
    cameraUnsupported: t({
      en: "Camera scanning is not available in this browser. Use manual entry.",
      fr: "Le scan par caméra n'est pas disponible dans ce navigateur. Utilisez la saisie manuelle.",
      vi: "Trình duyệt này không hỗ trợ quét camera. Vui lòng nhập thủ công.",
    }),
    invalidCode: t({
      en: "That code is not a valid registration QR code.",
      fr: "Ce code n'est pas un code QR d'inscription valide.",
      vi: "Mã này không phải mã QR đăng ký hợp lệ.",
    }),
    manualTitle: t({ en: "Manual entry", fr: "Saisie manuelle", vi: "Nhập thủ công" }),
    registrationId: t({
      en: "Registration ID",
      fr: "Identifiant d'inscription",
      vi: "Mã đăng ký",
    }),
    manualPlaceholder: t({
      en: "Paste or type the registration ID",
      fr: "Collez ou saisissez l'identifiant d'inscription",
      vi: "Dán hoặc nhập mã đăng ký",
    }),
    lookUp: t({ en: "Look up and check in", fr: "Rechercher et pointer", vi: "Tìm và điểm danh" }),
    scanAgain: t({ en: "Scan next", fr: "Scanner suivant", vi: "Quét tiếp" }),
    checkinSuccess: t({
      en: "Checked in successfully.",
      fr: "Pointage effectué.",
      vi: "Điểm danh thành công.",
    }),
    alreadyCheckedIn: t({
      en: "This registration was already checked in.",
      fr: "Cette inscription a déjà été pointée.",
      vi: "Đăng ký này đã được điểm danh trước đó.",
    }),
    checkinFailed: t({
      en: "Could not check in this registration.",
      fr: "Impossible de pointer cette inscription.",
      vi: "Không thể điểm danh đăng ký này.",
    }),
    registrationNotFound: t({
      en: "Registration not found for this event.",
      fr: "Inscription introuvable pour cet événement.",
      vi: "Không tìm thấy đăng ký cho sự kiện này.",
    }),
    paymentRequired: t({
      en: "Payment must be confirmed before check-in.",
      fr: "Le paiement doit être confirmé avant le pointage.",
      vi: "Cần xác nhận thanh toán trước khi điểm danh.",
    }),
    undo: t({ en: "Undo check-in", fr: "Annuler le pointage", vi: "Hủy điểm danh" }),
    undoSuccess: t({
      en: "Check-in removed.",
      fr: "Pointage annulé.",
      vi: "Đã hủy điểm danh.",
    }),
    undoFailed: t({
      en: "Could not undo the check-in.",
      fr: "Impossible d'annuler le pointage.",
      vi: "Không thể hủy điểm danh.",
    }),
    checkedInAt: t({ en: "Checked in at", fr: "Pointé à", vi: "Điểm danh lúc" }),
    tickets: t({ en: "Tickets", fr: "Billets", vi: "Vé" }),
    recent: t({ en: "Recent check-ins", fr: "Pointages récents", vi: "Điểm danh gần đây" }),
    noRecent: t({
      en: "No check-ins yet.",
      fr: "Aucun pointage pour le moment.",
      vi: "Chưa có điểm danh.",
    }),
    total: t({ en: "Total check-ins", fr: "Total des pointages", vi: "Tổng điểm danh" }),
    qrTitle: t({ en: "Registration QR", fr: "Code QR d'inscription", vi: "Mã QR đăng ký" }),
    qrHelp: t({
      en: "Show this code at the event check-in desk.",
      fr: "Présentez ce code au comptoir de pointage de l'événement.",
      vi: "Xuất trình mã này tại quầy điểm danh sự kiện.",
    }),
    printQr: t({ en: "Print QR", fr: "Imprimer le QR", vi: "In mã QR" }),
    openScanner: t({ en: "Open scanner", fr: "Ouvrir le lecteur", vi: "Mở máy quét" }),
    openPayments: t({ en: "Open payments", fr: "Ouvrir les paiements", vi: "Mở thanh toán" }),
    paymentPendingQr: t({
      en: "This QR code is available only after staff confirm payment.",
      fr: "Ce code QR n'est disponible qu'après confirmation du paiement par l'équipe.",
      vi: "Mã QR chỉ có sau khi nhân viên xác nhận thanh toán.",
    }),
    backToEvent: t({ en: "Back to event", fr: "Retour à l'événement", vi: "Quay lại sự kiện" }),
    qrLink: t({ en: "QR", fr: "QR", vi: "QR" }),
    registration: t({ en: "Registration", fr: "Inscription", vi: "Đăng ký" }),
  },
} satisfies Dictionary;

export default engineCheckinContent;
