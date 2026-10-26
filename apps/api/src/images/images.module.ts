import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
    controllers: [ImagesController],
    providers: [ImagesService],
    exports: [ImagesService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ImagesModule {}
