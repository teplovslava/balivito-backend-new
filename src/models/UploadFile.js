import {Schema, model} from 'mongoose';

const uploadedFileSchema = new Schema({
    uri: { type: String, required: true },
    filename: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  }, { timestamps: true });

export default model('UploadedFile', uploadedFileSchema);
