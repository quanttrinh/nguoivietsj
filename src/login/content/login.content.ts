// @boundary shared
import { t, type Dictionary } from "intlayer";

const loginContent = {
  key: "login",
  content: {
    metaTitle: t({ en: "Sign in", fr: "Connexion", vi: "Đăng nhập" }),
    metaDescription: t({
      en: "Sign in to your account to manage your events.",
      fr: "Connectez-vous à votre compte pour gérer vos événements.",
      vi: "Đăng nhập vào tài khoản để quản lý sự kiện của bạn.",
    }),
    heading: t({ en: "Welcome back", fr: "Bon retour", vi: "Chào mừng trở lại" }),
    intro: t({
      en: "Sign in with your email and password.",
      fr: "Connectez-vous avec votre courriel et mot de passe.",
      vi: "Đăng nhập bằng email và mật khẩu của bạn.",
    }),
    emailLabel: t({ en: "Email", fr: "Courriel", vi: "Email" }),
    passwordLabel: t({ en: "Password", fr: "Mot de passe", vi: "Mật khẩu" }),
    rememberMe: t({ en: "Keep me signed in", fr: "Rester connecté", vi: "Ghi nhớ đăng nhập" }),
    submit: t({ en: "Sign in", fr: "Connexion", vi: "Đăng nhập" }),
    submitting: t({ en: "Signing in…", fr: "Connexion…", vi: "Đang đăng nhập…" }),
    fieldsRequired: t({
      en: "Enter your email and password.",
      fr: "Saisissez votre courriel et mot de passe.",
      vi: "Nhập email và mật khẩu của bạn.",
    }),
    signInFailed: t({
      en: "Sign-in failed. Please try again.",
      fr: "La connexion a échoué. Veuillez réessayer.",
      vi: "Đăng nhập không thành công. Vui lòng thử lại.",
    }),
    unavailable: t({
      en: "Sign-in is temporarily unavailable. Try again later.",
      fr: "La connexion est temporairement indisponible. Réessayez plus tard.",
      vi: "Đăng nhập tạm thời không khả dụng. Vui lòng thử lại sau.",
    }),
    codeHeading: t({
      en: "Enter your sign-in code",
      fr: "Saisissez votre code de connexion",
      vi: "Nhập mã đăng nhập",
    }),
    codeHintTotp: t({
      en: "Open your authenticator app and enter the 6-digit code.",
      fr: "Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.",
      vi: "Mở ứng dụng xác thực và nhập mã 6 chữ số.",
    }),
    codeHintEmail: t({
      en: "We emailed you a 6-digit code. It expires in 3 minutes.",
      fr: "Nous vous avons envoyé un code à 6 chiffres. Il expire dans 3 minutes.",
      vi: "Chúng tôi đã gửi mã 6 chữ số đến email của bạn. Mã hết hạn sau 3 phút.",
    }),
    codeHintBackup: t({
      en: "Enter one of your backup codes. Each code works once.",
      fr: "Saisissez l'un de vos codes de secours. Chaque code ne fonctionne qu'une fois.",
      vi: "Nhập một mã dự phòng. Mỗi mã chỉ dùng được một lần.",
    }),
    codeLabel: t({ en: "Code", fr: "Code", vi: "Mã" }),
    trustDevice: t({
      en: "Trust this device for 30 days",
      fr: "Faire confiance à cet appareil pendant 30 jours",
      vi: "Tin cậy thiết bị này trong 30 ngày",
    }),
    verify: t({ en: "Verify", fr: "Vérifier", vi: "Xác minh" }),
    useTotp: t({
      en: "Use authenticator app",
      fr: "Utiliser l'application d'authentification",
      vi: "Dùng ứng dụng xác thực",
    }),
    useEmail: t({ en: "Email me a code", fr: "M'envoyer un code", vi: "Gửi mã qua email" }),
    useBackup: t({
      en: "Use a backup code",
      fr: "Utiliser un code de secours",
      vi: "Dùng mã dự phòng",
    }),
    codeRequired: t({
      en: "Enter the code.",
      fr: "Saisissez le code.",
      vi: "Vui lòng nhập mã.",
    }),
  },
} satisfies Dictionary;

export default loginContent;
