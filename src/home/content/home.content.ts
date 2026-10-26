import { t, type Dictionary } from "intlayer";

const homeContent = {
  key: "home",
  content: {
    meta: {
      title: t({
        en: "Người Việt SJ",
        fr: "Người Việt SJ",
        vi: "Người Việt SJ",
      }),
      description: t({
        en: "A home for the Vietnamese community in Saint John.",
        fr: "Un espace pour la communauté vietnamienne de Saint John.",
        vi: "Một mái nhà cho cộng đồng người Việt tại Saint John.",
      }),
    },
    eyebrow: t({
      en: "Community · Culture · Connection",
      fr: "Communauté · Culture · Connexion",
      vi: "Cộng đồng · Văn hóa · Kết nối",
    }),
    heading: t({
      en: "Welcome to the Vietnamese community in Saint John",
      fr: "Bienvenue dans la communauté vietnamienne de Saint John",
      vi: "Chào mừng đến với cộng đồng người Việt tại Saint John",
    }),
    intro: t({
      en: "Come together, preserve our culture, and create lasting memories with neighbours and friends.",
      fr: "Rassemblons-nous, préservons notre culture et créons des souvenirs durables avec nos voisins et nos amis.",
      vi: "Cùng gắn kết, gìn giữ văn hóa và tạo nên những kỷ niệm đáng nhớ với bà con và bạn bè.",
    }),
    event: {
      eyebrow: t({
        en: "Upcoming events",
        fr: "Événements à venir",
        vi: "Sự kiện sắp tới",
      }),
      title: t({
        en: "Discover community events",
        fr: "Découvrez les événements communautaires",
        vi: "Khám phá các sự kiện cộng đồng",
      }),
      description: t({
        en: "Browse upcoming gatherings, celebrations, and programs from the Vietnamese community in Saint John.",
        fr: "Parcourez les rassemblements, célébrations et programmes à venir de la communauté vietnamienne de Saint John.",
        vi: "Xem các buổi gặp gỡ, lễ hội và chương trình sắp tới của cộng đồng người Việt tại Saint John.",
      }),
      cta: t({
        en: "Browse events",
        fr: "Voir les événements",
        vi: "Xem sự kiện",
      }),
    },
  },
} satisfies Dictionary;

export default homeContent;
