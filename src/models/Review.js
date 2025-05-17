// 📁 models/Review.js
import { Schema, model } from 'mongoose';

const reviewSchema = new Schema(
  {
    /** кто написал */
    author : { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** о ком */
    target : { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** объявление, по поводу которого отзыв */
    ad     : { type: Schema.Types.ObjectId, ref: 'Ad',   required: true },

    /** текст + оценка (оценка только у «корневых» отзывов) */
    text   : { type: String, required: true },
    rating : { type: Number, min: 1, max: 5, default: null },

    /** reply-дерево */
    parent : { type: Schema.Types.ObjectId, ref: 'Review', default: null }, // ⇒ если null — «корневой» отзыв

    /** системные поля */
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* Один и тот же автор не может дважды писать одному и тому же
   получателю по одному объявлению, если они оба «корневые».            */
reviewSchema.index(
  { author: 1, target: 1, ad: 1, parent: 1 },
  { unique: true, partialFilterExpression: { parent: null } }
);

export default model('Review', reviewSchema);
