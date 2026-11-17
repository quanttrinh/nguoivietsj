// @boundary shared
import { t, type Dictionary } from "intlayer";

const twoFactorSetupContent = {
  key: "two-factor-setup",
  content: {
    metaTitle: t({
      en: "Set up two-factor authentication",
      fr: "Configurer l'authentification à deux facteurs",
      vi: "Thiết lập xác thực hai lớp",
    }),
    heading: t({
      en: "Protect your account",
      fr: "Protégez votre compte",
      vi: "Bảo vệ tài khoản của bạn",
    }),
    intro: t({
      en: "Staff and administrator accounts need a second sign-in step. Confirm your password to start.",
      fr: "Les comptes du personnel et des administrateurs exigent une deuxième étape de connexion. Confirmez votre mot de passe pour commencer.",
      vi: "Tài khoản nhân viên và quản trị cần bước đăng nhập thứ hai. Xác nhận mật khẩu để bắt đầu.",
    }),
    passwordLabel: t({ en: "Password", fr: "Mot de passe", vi: "Mật khẩu" }),
    start: t({ en: "Continue", fr: "Continuer", vi: "Tiếp tục" }),
    scan: t({
      en: "Scan this QR code with an authenticator app, then enter the 6-digit code it shows.",
      fr: "Scannez ce code QR avec une application d'authentification, puis saisissez le code à 6 chiffres affiché.",
      vi: "Quét mã QR bằng ứng dụng xác thực, rồi nhập mã 6 chữ số hiển thị.",
    }),
    secretLabel: t({
      en: "Can't scan? Enter this key:",
      fr: "Impossible de scanner ? Saisissez cette clé :",
      vi: "Không quét được? Nhập khóa này:",
    }),
    codeLabel: t({ en: "Code", fr: "Code", vi: "Mã" }),
    confirm: t({ en: "Turn on", fr: "Activer", vi: "Bật" }),
    backupHeading: t({
      en: "Save your backup codes",
      fr: "Enregistrez vos codes de secours",
      vi: "Lưu mã dự phòng",
    }),
    backupIntro: t({
      en: "Each code signs you in once if you lose your device. They are shown only now.",
      fr: "Chaque code permet une connexion si vous perdez votre appareil. Ils ne sont affichés qu'une fois.",
      vi: "Mỗi mã cho phép đăng nhập một lần nếu bạn mất thiết bị. Mã chỉ hiển thị lần này.",
    }),
    done: t({ en: "Continue", fr: "Continuer", vi: "Tiếp tục" }),
    signInFirst: t({
      en: "Sign in first, then return to this page.",
      fr: "Connectez-vous d'abord, puis revenez sur cette page.",
      vi: "Hãy đăng nhập trước, rồi quay lại trang này.",
    }),
    required: t({
      en: "Fill in this field.",
      fr: "Remplissez ce champ.",
      vi: "Vui lòng điền trường này.",
    }),
    failed: t({
      en: "That did not work. Please try again.",
      fr: "Cela n'a pas fonctionné. Veuillez réessayer.",
      vi: "Không thành công. Vui lòng thử lại.",
    }),
  },
} satisfies Dictionary;

export default twoFactorSetupContent;
