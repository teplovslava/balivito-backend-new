export const REMINDER_TEXTS = {
  ru: (seller, ad) =>
    `Вы недавно общались с продавцом ${seller} по объявлению «${ad}». Если сделка уже состоялась или вы получили впечатление от общения, поделитесь своим опытом и оставьте отзыв о продавце.`,
  en: (seller, ad) =>
    `You recently chatted with the seller ${seller} about the ad "${ad}". If the deal is done or you have an impression from the conversation, share your experience and leave a review about the seller.`,
  id: (seller, ad) =>
    `Anda baru saja berkomunikasi dengan penjual ${seller} tentang iklan "${ad}". Jika transaksi sudah terjadi atau Anda memiliki kesan dari komunikasi tersebut, bagikan pengalaman Anda dan tinggalkan ulasan tentang penjual.`,
  bjn: (seller, ad) =>
    `Ikam baru haja barurusan lawan panyual ${seller} mengenai iklan "${ad}". Mun transaksinya sudah jadi atawa sudah dapet kesan, bagiakan pengalaman ikam dan tulisi ulasan tentang panyualnya.`,
};

export const LEAVE_REVIEW_LABEL = {
  ru: "Оставить отзыв",
  en: "Leave a review",
  id: "Tinggalkan ulasan",
  bjn: "Tulisi ulasan",
};

export const SYSTEM_MESSAGE_TITLE = {
  ru: "Системное сообщение",
  en: "System message",
  id: "Pesan sistem",
  bjn: "Pesan sistem",
};
