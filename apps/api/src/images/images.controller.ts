import { Controller, Get, Header, HttpCode, Param, Post, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { HostGuard, type HostRequest } from '../auth/host.guard.js';
import { AppError } from '../common/errors.js';
import { ImagesService, type UploadedFile } from './images.service.js';

/** The OpenAPI validator's multipart middleware (size-limited multer) fills `req.files` before Nest runs. */
type UploadRequest = HostRequest & { files?: (UploadedFile & { fieldname: string })[] };

@Controller('api/v1/images')
export class ImagesController {
    constructor(private readonly images: ImagesService) {}

    @Post()
    @HttpCode(201)
    @UseGuards(HostGuard)
    upload(@Req() req: UploadRequest): Promise<{ id: string; url: string }> {
        const file = req.files?.find((candidate) => candidate.fieldname === 'file');
        if (!file) throw new AppError('INVALID_PAYLOAD', 400);
        return this.images.upload(req.hostId, file);
    }

    /** Public: addressed by an unguessable UUID so `<img>` tags work for players without a session. */
    @Get(':id')
    @Header('Cache-Control', 'public, max-age=31536000, immutable')
    async get(@Param('id') id: string): Promise<StreamableFile> {
        const { body, contentType } = await this.images.stream(id);
        return new StreamableFile(body, { type: contentType });
    }
}
