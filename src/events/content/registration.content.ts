import { t, type Dictionary } from "intlayer";

const engineRegistrationContent = {
  key: "engineRegistration",
  content: {
    meta: {
      title: t({
        en: "Event registration",
        fr: "Inscription à l'événement",
        vi: "Đăng ký sự kiện",
      }),
      description: t({
        en: "Register for this event.",
        fr: "Inscrivez-vous à cet événement.",
        vi: "Đăng ký tham dự sự kiện này.",
      }),
    },
    eyebrow: t({
      en: "Registration",
      fr: "Inscription",
      vi: "Đăng ký",
    }),
    intro: t({
      en: "Complete the form below to reserve your place.",
      fr: "Remplissez le formulaire ci-dessous pour réserver votre place.",
      vi: "Hoàn thành biểu mẫu bên dưới để giữ chỗ của bạn.",
    }),
    event: {
      when: t({ en: "When", fr: "Quand", vi: "Thời gian" }),
      tickets: t({ en: "Tickets", fr: "Billets", vi: "Vé" }),
      free: t({ en: "Free", fr: "Gratuit", vi: "Miễn phí" }),
      remainingParts: t({
        en: ["", " remaining"],
        fr: ["", " restants"],
        vi: ["Còn ", ""],
      }),
      soldOut: t({ en: "Sold out", fr: "Épuisé", vi: "Đã hết" }),
      registrationClosed: t({
        en: "Registration is closed",
        fr: "Les inscriptions sont fermées",
        vi: "Đăng ký đã đóng",
      }),
      registrationClosedBody: t({
        en: "This event is no longer accepting registrations.",
        fr: "Cet événement n'accepte plus d'inscriptions.",
        vi: "Sự kiện này không còn nhận đăng ký.",
      }),
      unavailable: t({
        en: "Registration is unavailable",
        fr: "L'inscription n'est pas disponible",
        vi: "Đăng ký không khả dụng",
      }),
      unavailableBody: t({
        en: "The registration form is not available right now. Please try again later.",
        fr: "Le formulaire d'inscription n'est pas disponible pour le moment. Veuillez réessayer plus tard.",
        vi: "Biểu mẫu đăng ký hiện không khả dụng. Vui lòng thử lại sau.",
      }),
    },
    info: {
      title: t({
        en: "Event information",
        fr: "Informations sur l'événement",
        vi: "Thông tin sự kiện",
      }),
      details: t({ en: "Date & location", fr: "Date et lieu", vi: "Ngày giờ và địa điểm" }),
      pricing: t({ en: "Tickets & pricing", fr: "Billets et tarifs", vi: "Vé và giá" }),
      payment: t({ en: "Payment", fr: "Paiement", vi: "Thanh toán" }),
      notes: t({
        en: "Additional information",
        fr: "Informations supplémentaires",
        vi: "Thông tin bổ sung",
      }),
      location: t({ en: "Location", fr: "Lieu", vi: "Địa điểm" }),
      venueTba: t({
        en: "Venue to be announced",
        fr: "Lieu à confirmer",
        vi: "Địa điểm sẽ được thông báo",
      }),
      directions: t({ en: "Open in maps", fr: "Ouvrir dans les cartes", vi: "Mở bản đồ" }),
      mapTitle: t({
        en: "Event location map",
        fr: "Carte du lieu de l'événement",
        vi: "Bản đồ địa điểm sự kiện",
      }),
      price: t({ en: "Price", fr: "Prix", vi: "Giá" }),
      etransfer: t({ en: "e-Transfer", fr: "Virement Interac", vi: "Chuyển khoản" }),
      etransferInstruction: t({
        en: "Send your payment by e-Transfer to",
        fr: "Envoyez votre paiement par virement à",
        vi: "Gửi thanh toán bằng chuyển khoản đến",
      }),
      cash: t({ en: "Cash", fr: "Comptant", vi: "Tiền mặt" }),
      cashInstruction: t({
        en: "Pay in person at",
        fr: "Payez en personne à",
        vi: "Thanh toán trực tiếp tại",
      }),
      paymentNotConfigured: t({
        en: "Payment instructions are not configured.",
        fr: "Les instructions de paiement ne sont pas configurées.",
        vi: "Chưa có hướng dẫn thanh toán.",
      }),
      cashMapTitle: t({
        en: "Cash payment location map",
        fr: "Carte du lieu de paiement comptant",
        vi: "Bản đồ địa điểm thanh toán tiền mặt",
      }),
    },
    form: {
      title: t({
        en: "Your registration",
        fr: "Votre inscription",
        vi: "Đăng ký của bạn",
      }),
      description: t({
        en: "Fields marked with an asterisk are required.",
        fr: "Les champs marqués d'un astérisque sont obligatoires.",
        vi: "Các trường có dấu hoa thị là bắt buộc.",
      }),
      submit: t({ en: "Register", fr: "S'inscrire", vi: "Đăng ký" }),
      submitting: t({
        en: "Registering…",
        fr: "Inscription…",
        vi: "Đang đăng ký…",
      }),
      noscript: t({
        en: "JavaScript is required to submit this form.",
        fr: "JavaScript est nécessaire pour soumettre ce formulaire.",
        vi: "Cần bật JavaScript để gửi biểu mẫu này.",
      }),
      requiredHint: t({
        en: "Required fields are marked with an asterisk.",
        fr: "Les champs obligatoires sont marqués d'un astérisque.",
        vi: "Các trường bắt buộc được đánh dấu bằng dấu hoa thị.",
      }),
    },
    fields: {
      fullName: {
        label: t({ en: "Full name", fr: "Nom complet", vi: "Họ và tên" }),
        placeholder: t({
          en: "Full name",
          fr: "Nom complet",
          vi: "Họ và tên",
        }),
        help: t({
          en: "As it should appear on your ticket.",
          fr: "Tel qu'il doit apparaître sur votre billet.",
          vi: "Ghi đúng như trên vé của bạn.",
        }),
      },
      consent: {
        label: t({
          en: "I agree to the event terms.",
          fr: "J'accepte les conditions de l'événement.",
          vi: "Tôi đồng ý với điều khoản của sự kiện.",
        }),
        help: t({
          en: "You must agree before registering.",
          fr: "Vous devez accepter avant de vous inscrire.",
          vi: "Bạn phải đồng ý trước khi đăng ký.",
        }),
      },
      email: {
        label: t({ en: "Email", fr: "Courriel", vi: "Email" }),
        placeholder: t({
          en: "you@example.com",
          fr: "vous@exemple.com",
          vi: "ban@vidu.com",
        }),
        help: t({
          en: "We send confirmations here.",
          fr: "Nous envoyons les confirmations ici.",
          vi: "Chúng tôi gửi xác nhận đến đây.",
        }),
      },
      phone: {
        label: t({ en: "Phone", fr: "Téléphone", vi: "Số điện thoại" }),
        placeholder: t({
          en: "(514) 555-0123",
          fr: "(514) 555-0123",
          vi: "(514) 555-0123",
        }),
        help: t({
          en: "We only use this to contact you about the event.",
          fr: "Nous l'utilisons uniquement pour vous contacter au sujet de l'événement.",
          vi: "Chúng tôi chỉ dùng số này để liên hệ về sự kiện.",
        }),
      },
      mail: {
        label: t({
          en: "Mailing address",
          fr: "Adresse postale",
          vi: "Địa chỉ nhận thư",
        }),
        help: t({
          en: "We send your ticket and invitation here.",
          fr: "Nous envoyons votre billet et votre invitation ici.",
          vi: "Chúng tôi gửi vé và thiệp mời đến đây.",
        }),
      },
      confirmation: {
        label: t({
          en: "Confirmation method",
          fr: "Méthode de confirmation",
          vi: "Cách xác nhận",
        }),
        help: t({
          en: "Choose how we should confirm your registration.",
          fr: "Choisissez comment nous devons confirmer votre inscription.",
          vi: "Chọn cách chúng tôi xác nhận đăng ký của bạn.",
        }),
        none: t({
          en: "No confirmation",
          fr: "Aucune confirmation",
          vi: "Không xác nhận",
        }),
      },
      tickets: {
        label: t({ en: "Tickets", fr: "Billets", vi: "Vé" }),
        help: t({
          en: "Select at least one ticket.",
          fr: "Sélectionnez au moins un billet.",
          vi: "Chọn ít nhất một vé.",
        }),
      },
    },
    mail: {
      addressLine1: t({
        en: "Address line 1",
        fr: "Adresse ligne 1",
        vi: "Địa chỉ dòng 1",
      }),
      addressLine2: t({
        en: "Address line 2",
        fr: "Adresse ligne 2",
        vi: "Địa chỉ dòng 2",
      }),
      city: t({ en: "City", fr: "Ville", vi: "Thành phố" }),
      province: t({
        en: "Province / state",
        fr: "Province / État",
        vi: "Tỉnh / Bang",
      }),
      postalCode: t({
        en: "Postal code",
        fr: "Code postal",
        vi: "Mã bưu chính",
      }),
      country: t({ en: "Country", fr: "Pays", vi: "Quốc gia" }),
      addressLine1Placeholder: t({
        en: "123 Main Street",
        fr: "123 rue Principale",
        vi: "123 Đường Chính",
      }),
      addressLine2Placeholder: t({
        en: "Apartment, suite, etc.",
        fr: "Appartement, suite, etc.",
        vi: "Căn hộ, tầng, v.v.",
      }),
      cityPlaceholder: t({
        en: "Saint John",
        fr: "Saint John",
        vi: "Saint John",
      }),
      provincePlaceholder: t({
        en: "NB",
        fr: "NB",
        vi: "NB",
      }),
      postalCodePlaceholder: t({
        en: "E2L 1A1",
        fr: "E2L 1A1",
        vi: "E2L 1A1",
      }),
      countryPlaceholder: t({
        en: "CA",
        fr: "CA",
        vi: "CA",
      }),
    },
    groups: {
      none: t({
        en: "No preference",
        fr: "Aucune préférence",
        vi: "Không có lựa chọn",
      }),
    },
    errors: {
      required: t({
        en: "This field is required.",
        fr: "Ce champ est obligatoire.",
        vi: "Trường này là bắt buộc.",
      }),
      fullName: t({
        en: "Enter your full name.",
        fr: "Entrez votre nom complet.",
        vi: "Vui lòng nhập họ và tên.",
      }),
      fullNameInvalid: t({
        en: "Use letters, spaces, apostrophes, or hyphens only.",
        fr: "Utilisez uniquement des lettres, des espaces, des apostrophes ou des traits d'union.",
        vi: "Chỉ sử dụng chữ cái, khoảng trắng, dấu nháy đơn hoặc dấu gạch nối.",
      }),
      email: t({
        en: "Enter a valid email address.",
        fr: "Entrez une adresse courriel valide.",
        vi: "Nhập địa chỉ email hợp lệ.",
      }),
      phone: t({
        en: "Enter a valid phone number.",
        fr: "Entrez un numéro de téléphone valide.",
        vi: "Nhập số điện thoại hợp lệ.",
      }),
      postalCode: t({
        en: "Enter a valid postal code.",
        fr: "Entrez un code postal valide.",
        vi: "Nhập mã bưu chính hợp lệ.",
      }),
      atLeastOneContact: t({
        en: "Provide at least one contact method.",
        fr: "Fournissez au moins un moyen de contact.",
        vi: "Cung cấp ít nhất một cách liên hệ.",
      }),
      atLeastOneTicket: t({
        en: "Select at least one ticket.",
        fr: "Sélectionnez au moins un billet.",
        vi: "Chọn ít nhất một vé.",
      }),
      ticketLimit: t({
        en: "The selected tickets exceed the registration limit.",
        fr: "Les billets sélectionnés dépassent la limite d'inscription.",
        vi: "Số vé đã chọn vượt quá giới hạn đăng ký.",
      }),
      ticketTypeLimit: t({
        en: "The selected quantity exceeds the limit for this ticket type.",
        fr: "La quantité sélectionnée dépasse la limite pour ce type de billet.",
        vi: "Số lượng đã chọn vượt quá giới hạn cho loại vé này.",
      }),
      eventCapacity: t({
        en: "The event is sold out.",
        fr: "L'événement est complet.",
        vi: "Sự kiện đã hết vé.",
      }),
      duplicate: t({
        en: "A registration with these details already exists.",
        fr: "Une inscription avec ces informations existe déjà.",
        vi: "Đã có đăng ký với thông tin này.",
      }),
      confirmationRequired: t({
        en: "Choose a confirmation method.",
        fr: "Choisissez une méthode de confirmation.",
        vi: "Chọn cách xác nhận.",
      }),
      confirmationContact: t({
        en: "Provide the contact details for the selected confirmation method.",
        fr: "Fournissez les coordonnées correspondant à la méthode de confirmation choisie.",
        vi: "Cung cấp thông tin liên hệ cho cách xác nhận đã chọn.",
      }),
      confirmationMultiple: t({
        en: "Choose only one confirmation method.",
        fr: "Choisissez une seule méthode de confirmation.",
        vi: "Chỉ chọn một cách xác nhận.",
      }),
      confirmationNotAllowed: t({
        en: "Confirmation is not available for this event.",
        fr: "La confirmation n'est pas disponible pour cet événement.",
        vi: "Sự kiện này không hỗ trợ xác nhận.",
      }),
      duplicateContact: t({
        en: "Provide only one contact of each type.",
        fr: "Fournissez un seul contact de chaque type.",
        vi: "Chỉ cung cấp một liên hệ cho mỗi loại.",
      }),
      invalidValue: t({
        en: "Enter a valid value.",
        fr: "Entrez une valeur valide.",
        vi: "Nhập một giá trị hợp lệ.",
      }),
      ticketUnavailable: t({
        en: "This ticket type is not available.",
        fr: "Ce type de billet n'est pas disponible.",
        vi: "Loại vé này không khả dụng.",
      }),
      groupOneOf: t({
        en: "Choose exactly one option.",
        fr: "Choisissez exactement une option.",
        vi: "Chọn chính xác một tùy chọn.",
      }),
      groupAtLeastOne: t({
        en: "Choose at least one option.",
        fr: "Choisissez au moins une option.",
        vi: "Chọn ít nhất một tùy chọn.",
      }),
      groupAllOf: t({
        en: "Complete all options.",
        fr: "Remplissez toutes les options.",
        vi: "Hoàn thành tất cả tùy chọn.",
      }),
      invalidNumber: t({
        en: "Enter a valid number.",
        fr: "Entrez un nombre valide.",
        vi: "Nhập một số hợp lệ.",
      }),
      invalidOption: t({
        en: "Choose a valid option.",
        fr: "Choisissez une option valide.",
        vi: "Chọn một tùy chọn hợp lệ.",
      }),
      submit: t({
        en: "Registration failed. Please try again.",
        fr: "L'inscription a échoué. Veuillez réessayer.",
        vi: "Đăng ký thất bại. Vui lòng thử lại.",
      }),
      invalidPayload: t({
        en: "Some information is invalid. Review the form and try again.",
        fr: "Certaines informations sont invalides. Vérifiez le formulaire et réessayez.",
        vi: "Một số thông tin không hợp lệ. Vui lòng kiểm tra và thử lại.",
      }),
      rateLimited: t({
        en: "Too many attempts. Please wait a minute and try again.",
        fr: "Trop de tentatives. Veuillez patienter une minute et réessayer.",
        vi: "Quá nhiều lần thử. Vui lòng đợi một phút rồi thử lại.",
      }),
      turnstile: t({
        en: "Complete the security check and try again.",
        fr: "Complétez la vérification de sécurité et réessayez.",
        vi: "Hoàn thành bước xác minh bảo mật và thử lại.",
      }),
    },
    previewNotice: t({
      en: "Preview only. Submission is disabled.",
      fr: "Aperçu uniquement. L'envoi est désactivé.",
      vi: "Chỉ xem trước. Không thể gửi.",
    }),
    success: {
      title: t({
        en: "Registration received",
        fr: "Inscription reçue",
        vi: "Đã nhận đăng ký",
      }),
      body: t({
        en: "Your registration has been received. Keep your reference number for your records.",
        fr: "Votre inscription a été reçue. Conservez votre numéro de référence.",
        vi: "Đăng ký của bạn đã được nhận. Hãy giữ mã tham chiếu.",
      }),
      reference: t({
        en: "Reference",
        fr: "Référence",
        vi: "Mã tham chiếu",
      }),
      statusLink: t({
        en: "View registration status",
        fr: "Voir le statut de l'inscription",
        vi: "Xem trạng thái đăng ký",
      }),
      statusLookup: t({
        en: "Already registered? View your status",
        fr: "Déjà inscrit ? Voir votre statut",
        vi: "Đã đăng ký? Xem trạng thái",
      }),
      statusHelp: t({
        en: "Your QR code appears on the status page after payment is confirmed.",
        fr: "Votre code QR apparaît sur la page de statut après confirmation du paiement.",
        vi: "Mã QR của bạn sẽ xuất hiện trên trang trạng thái sau khi thanh toán được xác nhận.",
      }),
    },
  },
} satisfies Dictionary;

export default engineRegistrationContent;
