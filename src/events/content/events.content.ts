import { t, type Dictionary } from "intlayer";

const engineEventsContent = {
  key: "engineEvents",
  content: {
    meta: {
      title: t({
        en: "Events · Người Việt SJ",
        fr: "Événements · Người Việt SJ",
        vi: "Sự kiện · Người Việt SJ",
      }),
      description: t({
        en: "Upcoming events from the Vietnamese community in Saint John.",
        fr: "Événements à venir de la communauté vietnamienne de Saint John.",
        vi: "Các sự kiện sắp tới của cộng đồng người Việt tại Saint John.",
      }),
    },
    eyebrow: t({
      en: "Community events",
      fr: "Événements communautaires",
      vi: "Sự kiện cộng đồng",
    }),
    title: t({ en: "Events", fr: "Événements", vi: "Sự kiện" }),
    intro: t({
      en: "Browse upcoming gatherings and register online.",
      fr: "Parcourez les rassemblements à venir et inscrivez-vous en ligne.",
      vi: "Xem các buổi gặp gỡ sắp tới và đăng ký trực tuyến.",
    }),
    noEvents: t({
      en: "No upcoming events right now.",
      fr: "Aucun événement à venir pour le moment.",
      vi: "Hiện chưa có sự kiện sắp tới.",
    }),
    viewEvent: t({ en: "View event", fr: "Voir l'événement", vi: "Xem sự kiện" }),
    register: t({ en: "Register", fr: "S'inscrire", vi: "Đăng ký" }),
    registrationClosed: t({
      en: "Registration closed",
      fr: "Inscriptions fermées",
      vi: "Đã đóng đăng ký",
    }),
  },
} satisfies Dictionary;

export default engineEventsContent;
