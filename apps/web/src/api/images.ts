import type { Schemas } from './client';

export type ImageCreated = Schemas['ImageCreated'];

/** `POST` target of the multipart upload (field `file`); sent by `uploadImage` over XMLHttpRequest for progress events. */
export const IMAGES_PATH = '/api/v1/images';
