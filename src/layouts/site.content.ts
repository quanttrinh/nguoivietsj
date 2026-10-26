// @boundary astro
import { t, type Dictionary } from "intlayer";

const siteContent = {
  key: "site",
  content: {
    brand: t({
      en: "Greater Saint John Vietnamese Association",
      fr: "Association vietnamienne du Grand Saint John",
      vi: "Hội Người Việt Saint John",
    }),
    brandSubtitle: t({
      en: "Vietnamese community in Saint John",
      fr: "Communauté vietnamienne de Saint John",
      vi: "Cộng đồng người Việt tại Saint John",
    }),
    skipToContent: t({
      en: "Skip to main content",
      fr: "Aller au contenu principal",
      vi: "Chuyển đến nội dung chính",
    }),
    language: t({ en: "Language", fr: "Langue", vi: "Ngôn ngữ" }),
    adminShortcut: t({ en: "Admin", fr: "Administration", vi: "Quản trị" }),
    backToHome: t({
      en: "Back to home",
      fr: "Retour à l'accueil",
      vi: "Về trang chủ",
    }),
    notFound: {
      title: t({
        en: "Page not found",
        fr: "Page introuvable",
        vi: "Không tìm thấy trang",
      }),
      message: t({
        en: "The page you are looking for does not exist.",
        fr: "La page que vous cherchez n'existe pas.",
        vi: "Trang bạn tìm không tồn tại.",
      }),
    },
  },
} satisfies Dictionary;

export default siteContent;
