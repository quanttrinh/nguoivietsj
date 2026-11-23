// @boundary server
import { t } from "intlayer";

const sharedApiMessages = {
  key: "sharedApiMessages",
  content: {
    bad_request: t({
      en: "The request is invalid.",
      fr: "La requête est invalide.",
      vi: "Yêu cầu không hợp lệ.",
    }),
    generic_error: t({
      en: "Something went wrong.",
      fr: "Une erreur est survenue.",
      vi: "Đã xảy ra lỗi.",
    }),
    forbidden: t({
      en: "You do not have permission to do that.",
      fr: "Vous n'avez pas la permission d'effectuer cette action.",
      vi: "Bạn không có quyền thực hiện thao tác này.",
    }),
    two_factor_required: t({
      en: "Set up two-factor authentication to continue.",
      fr: "Configurez l'authentification à deux facteurs pour continuer.",
      vi: "Vui lòng thiết lập xác thực hai lớp để tiếp tục.",
    }),
    internal_server_error: t({
      en: "Something went wrong.",
      fr: "Une erreur est survenue.",
      vi: "Đã xảy ra lỗi.",
    }),
    invalid_payload: t({
      en: "Some fields are invalid.",
      fr: "Certains champs sont invalides.",
      vi: "Một số trường không hợp lệ.",
    }),
    not_found: t({
      en: "Not found.",
      fr: "Introuvable.",
      vi: "Không tìm thấy.",
    }),
    payload_too_large: t({
      en: "The request body is too large.",
      fr: "Le corps de la requête est trop volumineux.",
      vi: "Nội dung yêu cầu quá lớn.",
    }),
    rate_limited: t({
      en: "Too many requests. Try again later.",
      fr: "Trop de requêtes. Réessayez plus tard.",
      vi: "Quá nhiều yêu cầu. Hãy thử lại sau.",
    }),
    service_unavailable: t({
      en: "The service is temporarily unavailable.",
      fr: "Le service est temporairement indisponible.",
      vi: "Dịch vụ tạm thời không khả dụng.",
    }),
    turnstile_failed: t({
      en: "Verification failed. Try again.",
      fr: "La vérification a échoué. Réessayez.",
      vi: "Xác minh không thành công. Hãy thử lại.",
    }),
    turnstile_required: t({
      en: "Complete the verification challenge.",
      fr: "Complétez le défi de vérification.",
      vi: "Hãy hoàn thành bước xác minh.",
    }),
    turnstile_verification_failed: t({
      en: "Verification could not be completed.",
      fr: "La vérification n'a pas pu être terminée.",
      vi: "Không thể hoàn tất xác minh.",
    }),
    unauthorized: t({
      en: "Sign in is required.",
      fr: "Une connexion est requise.",
      vi: "Cần đăng nhập.",
    }),
    // Better-auth error codes (it ships no i18n plugin, only stable codes).
    BODY_MUST_BE_AN_OBJECT: t({
      en: "The request is invalid.",
      fr: "La requête est invalide.",
      vi: "Yêu cầu không hợp lệ.",
    }),
    CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: t({
      en: "Sign-in was blocked for security reasons.",
      fr: "La connexion a été bloquée pour des raisons de sécurité.",
      vi: "Đăng nhập bị chặn vì lý do bảo mật.",
    }),
    EMAIL_NOT_VERIFIED: t({
      en: "Verify your email before signing in.",
      fr: "Vérifiez votre courriel avant de vous connecter.",
      vi: "Vui lòng xác minh email trước khi đăng nhập.",
    }),
    FAILED_TO_CREATE_SESSION: t({
      en: "Could not start your session. Try again.",
      fr: "Impossible de démarrer votre session. Réessayez.",
      vi: "Không thể bắt đầu phiên. Vui lòng thử lại.",
    }),
    FAILED_TO_GET_SESSION: t({
      en: "Could not verify your session. Try again.",
      fr: "Impossible de vérifier votre session. Réessayez.",
      vi: "Không thể kiểm tra phiên. Vui lòng thử lại.",
    }),
    INVALID_EMAIL: t({
      en: "Enter a valid email address.",
      fr: "Saisissez une adresse courriel valide.",
      vi: "Nhập địa chỉ email hợp lệ.",
    }),
    INVALID_EMAIL_OR_PASSWORD: t({
      en: "Incorrect email or password.",
      fr: "Courriel ou mot de passe incorrect.",
      vi: "Email hoặc mật khẩu không đúng.",
    }),
    INVALID_ORIGIN: t({
      en: "The request was blocked for security reasons.",
      fr: "La requête a été bloquée pour des raisons de sécurité.",
      vi: "Yêu cầu bị chặn vì lý do bảo mật.",
    }),
    INVALID_PASSWORD: t({
      en: "Incorrect password.",
      fr: "Mot de passe incorrect.",
      vi: "Mật khẩu không đúng.",
    }),
    INVALID_TOKEN: t({
      en: "This link is no longer valid.",
      fr: "Ce lien n'est plus valide.",
      vi: "Liên kết này không còn hợp lệ.",
    }),
    MISSING_FIELD: t({
      en: "A required field is missing.",
      fr: "Un champ obligatoire est manquant.",
      vi: "Thiếu trường bắt buộc.",
    }),
    PASSWORD_TOO_LONG: t({
      en: "The password is too long.",
      fr: "Le mot de passe est trop long.",
      vi: "Mật khẩu quá dài.",
    }),
    PASSWORD_TOO_SHORT: t({
      en: "The password is too short.",
      fr: "Le mot de passe est trop court.",
      vi: "Mật khẩu quá ngắn.",
    }),
    SESSION_EXPIRED: t({
      en: "Your session expired. Sign in again.",
      fr: "Votre session a expiré. Reconnectez-vous.",
      vi: "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
    }),
    TOKEN_EXPIRED: t({
      en: "This link has expired.",
      fr: "Ce lien a expiré.",
      vi: "Liên kết này đã hết hạn.",
    }),
    USER_ALREADY_EXISTS: t({
      en: "An account already uses this email.",
      fr: "Un compte utilise déjà ce courriel.",
      vi: "Đã có tài khoản dùng email này.",
    }),
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: t({
      en: "An account already uses this email.",
      fr: "Un compte utilise déjà ce courriel.",
      vi: "Đã có tài khoản dùng email này.",
    }),
    USER_NOT_FOUND: t({
      en: "Account not found.",
      fr: "Compte introuvable.",
      vi: "Không tìm thấy tài khoản.",
    }),
    VALIDATION_ERROR: t({
      en: "Some fields are invalid.",
      fr: "Certains champs sont invalides.",
      vi: "Một số trường không hợp lệ.",
    }),
  },
};

export default sharedApiMessages;
