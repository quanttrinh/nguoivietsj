// @boundary shared
import { t } from "intlayer";

const engineApiMessages = {
  key: "engineApiMessages",
  content: {
    event_checkin_failed: t({
      en: "Check-in failed.",
      fr: "Le pointage a échoué.",
      vi: "Điểm danh không thành công.",
    }),
    event_checkin_not_found: t({
      en: "Check-in not found.",
      fr: "Pointage introuvable.",
      vi: "Không tìm thấy thông tin điểm danh.",
    }),
    event_code_invalid: t({
      en: "The code is invalid.",
      fr: "Le code est invalide.",
      vi: "Mã không hợp lệ.",
    }),
    event_code_locked: t({
      en: "Too many attempts. Request a new code.",
      fr: "Trop de tentatives. Demandez un nouveau code.",
      vi: "Quá nhiều lần thử. Hãy yêu cầu mã mới.",
    }),
    event_duplicate_registration: t({
      en: "You are already registered for this event.",
      fr: "Vous êtes déjà inscrit à cet événement.",
      vi: "Bạn đã đăng ký sự kiện này.",
    }),
    event_registration_email_not_queued: t({
      en: "The registration was created, but the confirmation email could not be sent.",
      fr: "L'inscription a été créée, mais l'e-mail de confirmation n'a pas pu être envoyé.",
      vi: "Đăng ký đã được tạo, nhưng không thể gửi email xác nhận.",
    }),
    event_capacity_reached: t({
      en: "The event is full.",
      fr: "L'événement est complet.",
      vi: "Sự kiện đã đủ chỗ.",
    }),
    event_create_failed: t({
      en: "Could not create the event.",
      fr: "Impossible de créer l'événement.",
      vi: "Không thể tạo sự kiện.",
    }),
    event_exists: t({
      en: "An event with that slug or edition already exists.",
      fr: "Un événement avec cette édition ou cet identifiant existe déjà.",
      vi: "Sự kiện với đường dẫn hoặc phiên bản này đã tồn tại.",
    }),
    event_not_found: t({
      en: "Event not found.",
      fr: "Événement introuvable.",
      vi: "Không tìm thấy sự kiện.",
    }),
    event_unavailable: t({
      en: "Registration is not available for this event.",
      fr: "L'inscription n'est pas disponible pour cet événement.",
      vi: "Sự kiện này hiện không nhận đăng ký.",
    }),
    event_update_failed: t({
      en: "Could not update the event.",
      fr: "Impossible de mettre à jour l'événement.",
      vi: "Không thể cập nhật sự kiện.",
    }),
    event_form_update_required: t({
      en: "Update the published form before activating this ticket type.",
      fr: "Mettez à jour le formulaire publié avant d'activer ce type de billet.",
      vi: "Hãy cập nhật biểu mẫu đã xuất bản trước khi kích hoạt loại vé này.",
    }),
    event_form_version_create_failed: t({
      en: "Could not create the form version.",
      fr: "Impossible de créer la version du formulaire.",
      vi: "Không thể tạo phiên bản biểu mẫu.",
    }),
    event_form_version_exists: t({
      en: "That form version already exists.",
      fr: "Cette version du formulaire existe déjà.",
      vi: "Phiên bản biểu mẫu này đã tồn tại.",
    }),
    event_invalid_event_id: t({
      en: "Invalid event ID.",
      fr: "Identifiant d'événement invalide.",
      vi: "Mã sự kiện không hợp lệ.",
    }),
    event_invalid_event_slug: t({
      en: "Invalid event slug.",
      fr: "Identifiant d'événement invalide.",
      vi: "Đường dẫn sự kiện không hợp lệ.",
    }),
    event_form_not_found: t({
      en: "Form not found for this event.",
      fr: "Formulaire introuvable pour cet événement.",
      vi: "Không tìm thấy biểu mẫu cho sự kiện này.",
    }),
    event_invalid_form_schema: t({
      en: "The form schema is invalid.",
      fr: "Le schéma du formulaire est invalide.",
      vi: "Lược đồ biểu mẫu không hợp lệ.",
    }),
    event_invalid_form_version: t({
      en: "The registration form version is invalid.",
      fr: "La version du formulaire d'inscription est invalide.",
      vi: "Phiên bản biểu mẫu đăng ký không hợp lệ.",
    }),
    event_invalid_registration_id: t({
      en: "Invalid registration ID.",
      fr: "Identifiant d'inscription invalide.",
      vi: "Mã đăng ký không hợp lệ.",
    }),
    event_payment_amount_too_low: t({
      en: "The payment amount is below the amount due.",
      fr: "Le montant du paiement est inférieur au montant dû.",
      vi: "Số tiền thanh toán thấp hơn số tiền cần trả.",
    }),
    event_payment_not_found: t({
      en: "Payment not found.",
      fr: "Paiement introuvable.",
      vi: "Không tìm thấy thanh toán.",
    }),
    event_payment_required: t({
      en: "Payment is required before check-in.",
      fr: "Le paiement est requis avant le pointage.",
      vi: "Cần thanh toán trước khi điểm danh.",
    }),
    event_payment_update_failed: t({
      en: "Could not update the payment.",
      fr: "Impossible de mettre à jour le paiement.",
      vi: "Không thể cập nhật thanh toán.",
    }),
    event_registration_closed: t({
      en: "Registration is closed.",
      fr: "Les inscriptions sont fermées.",
      vi: "Đăng ký đã đóng.",
    }),
    event_registration_failed: t({
      en: "Registration failed.",
      fr: "L'inscription a échoué.",
      vi: "Đăng ký không thành công.",
    }),
    event_registration_not_found: t({
      en: "Registration not found.",
      fr: "Inscription introuvable.",
      vi: "Không tìm thấy đăng ký.",
    }),
    event_ticket_limit_reached: t({
      en: "The ticket limit was reached.",
      fr: "La limite de billets a été atteinte.",
      vi: "Đã đạt giới hạn số vé.",
    }),
    event_ticket_type_capacity_reached: t({
      en: "That ticket type is sold out.",
      fr: "Ce type de billet est épuisé.",
      vi: "Loại vé này đã hết.",
    }),
    event_ticket_type_create_failed: t({
      en: "Could not create the ticket type.",
      fr: "Impossible de créer le type de billet.",
      vi: "Không thể tạo loại vé.",
    }),
    event_ticket_type_exists: t({
      en: "That ticket type already exists.",
      fr: "Ce type de billet existe déjà.",
      vi: "Loại vé này đã tồn tại.",
    }),
    event_ticket_type_not_found: t({
      en: "Ticket type not found.",
      fr: "Type de billet introuvable.",
      vi: "Không tìm thấy loại vé.",
    }),
    event_ticket_type_unavailable: t({
      en: "That ticket type is not available.",
      fr: "Ce type de billet n'est pas disponible.",
      vi: "Loại vé này không khả dụng.",
    }),
    event_ticket_type_update_failed: t({
      en: "Could not update the ticket type.",
      fr: "Impossible de mettre à jour le type de billet.",
      vi: "Không thể cập nhật loại vé.",
    }),
  },
};

export default engineApiMessages;
