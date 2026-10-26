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
  },
} satisfies Dictionary;

export default loginContent;
