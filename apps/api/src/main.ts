import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './config/config.js';

async function bootstrap(): Promise<void> {
    const config = loadConfig(process.env);
    const app = await NestFactory.create(AppModule.register({ config }));
    configureApp(app, config);
    app.enableShutdownHooks();
    await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
