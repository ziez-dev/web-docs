import introductionMd from './getting-started/introduction.md' with { type: 'text' }
import quickStartMd from './getting-started/quick-start.md' with { type: 'text' }
import projectStructureMd from './getting-started/project-structure.md' with { type: 'text' }

import routingMd from './essential/routing.md' with { type: 'text' }
import requestMd from './essential/request.md' with { type: 'text' }
import responseMd from './essential/response.md' with { type: 'text' }
import middlewareMd from './essential/middleware.md' with { type: 'text' }
import errorHandlingMd from './essential/error-handling.md' with { type: 'text' }

import serializationMd from './patterns/serialization.md' with { type: 'text' }
import streamingMd from './patterns/streaming.md' with { type: 'text' }
import interceptorsMd from './patterns/interceptors.md' with { type: 'text' }
import validationMd from './patterns/validation.md' with { type: 'text' }
import schemaValidationMd from './patterns/schema-validation.md' with { type: 'text' }
import cookiesMd from './patterns/cookies.md' with { type: 'text' }
import environmentMd from './patterns/environment.md' with { type: 'text' }
import loggingMd from './patterns/logging.md' with { type: 'text' }

import pluginsOverviewMd from './plugins/overview.md' with { type: 'text' }
import ziezCorsMd from './plugins/ziez-cors.md' with { type: 'text' }
import ziezCompressionMd from './plugins/ziez-compression.md' with { type: 'text' }
import ziezSecurityMd from './plugins/ziez-security.md' with { type: 'text' }
import ziezStaticMd from './plugins/ziez-static.md' with { type: 'text' }
import ziezTemplateMd from './plugins/ziez-template.md' with { type: 'text' }
import ziezTlsMd from './plugins/ziez-tls.md' with { type: 'text' }
import ziezTrackerMd from './plugins/ziez-tracker.md' with { type: 'text' }
import ziezUaParserMd from './plugins/ziez-ua-parser.md' with { type: 'text' }

export const contentMap: Record<string, string> = {
  '/': introductionMd,
  '/getting-started/quick-start': quickStartMd,
  '/getting-started/project-structure': projectStructureMd,
  '/essential/routing': routingMd,
  '/essential/request': requestMd,
  '/essential/response': responseMd,
  '/essential/middleware': middlewareMd,
  '/essential/error-handling': errorHandlingMd,
  '/patterns/serialization': serializationMd,
  '/patterns/streaming': streamingMd,
  '/patterns/interceptors': interceptorsMd,
  '/patterns/validation': validationMd,
  '/patterns/schema-validation': schemaValidationMd,
  '/patterns/cookies': cookiesMd,
  '/patterns/environment': environmentMd,
  '/patterns/logging': loggingMd,
  '/plugins/overview': pluginsOverviewMd,
  '/plugins/ziez-cors': ziezCorsMd,
  '/plugins/ziez-compression': ziezCompressionMd,
  '/plugins/ziez-security': ziezSecurityMd,
  '/plugins/ziez-static': ziezStaticMd,
  '/plugins/ziez-template': ziezTemplateMd,
  '/plugins/ziez-tls': ziezTlsMd,
  '/plugins/ziez-tracker': ziezTrackerMd,
  '/plugins/ziez-ua-parser': ziezUaParserMd,
}
