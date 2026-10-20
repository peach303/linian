import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true })
  const port = Number(process.env.PORT ?? 3001)
  await app.listen(port)
  console.log(`[黎念] server on http://localhost:${port}/api/v1`)
}

void bootstrap()
