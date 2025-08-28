## 0.3.26 (2025-8-28)

- chore: support reviewer github action

## 0.3.25 (2025-8-28)

- chore: support responseFormat for image generation

## 0.3.24 (2025-8-28)

- feat(core): add auto-topup with enhanced credits UI

## 0.3.23 (2025-8-27)

- chore: return usage for image generation api

## 0.3.22 (2025-8-27)

- chore: update package to latest

## 0.3.21 (2025-8-27)

- feat: integrate framework image agent for image generation

## 0.3.20 (2025-8-25)

- fix: remove default addPid header is used when headers are missing

## 0.3.19 (2025-8-25)

- fix: update caller did name for filtering call history

## 0.3.18 (2025-8-25)

- fix: add filtering by pid for call history

## 0.3.17 (2025-8-25)

- fix: show detailed popper info on user hover

## 0.3.16 (2025-8-22)

- fix(api): display user info of called AIGNE Hub

## 0.3.15 (2025-8-19)

- chore: update dependencies
- feat(core): add model rates configuration step in credits setup
- fix(api): update baseUrl validation for bedrock provider in schemas

## 0.3.14 (2025-8-18)

- fix(migrations): replace queryInterface with safeApplyColumnChanges for column modifications
- feat(core): doubao and poe provider support

## 0.3.13 (2025-8-15)

- fix(api): ensure model call completion tracking regardless of billing mode
- feat(api): implement hourly model call stats tracking with UTC timezone support
- feat(core): improve model usage statistics display
- feat(core): add comprehensive model pricing page with filtering and sorting
- fix(api): round usage amount to two decimal places in meter event reporting

## 0.3.12 (2025-8-13)

- feat(api): enhance app identification and improve model call tracking

## 0.3.11 (2025-8-13)

- feat(core): add credit usage analytics and management features

## 0.3.10 (2025-8-9)

- chore: bump deps to latest

## 0.3.9 (2025-8-9)

- chore: bump deps to latest

## 0.3.8 (2025-8-8)

- chore: bump deps to latest

## 0.3.7 (2025-8-7)

- fix: ensure assistant role handled correctly in convertToFrameworkMessages

## 0.3.6 (2025-8-6)

- fix: remove Gemini model from supported model list and config

## 0.3.5 (2025-8-6)

- chore: update package deps

## 0.3.4 (2025-8-5)

- feat: allow inserting agent-hub credits manually

## 0.3.3 (2025-8-4)

- fix: ensure toolCalls function only accepts string arguments

## 0.3.2 (2025-8-4)

- fix: correct image size format in model rate form options

## 0.3.1 (2025-8-4)

- chore: update community links and descriptions in documentation

## 0.3.0 (2025-8-1)

- feat(api): add model search functionality and update localization for model rates
- feat(api): enhance model rate schema with metadata support

## 0.2.24 (2025-7-31)

- chore: support gemini model

## 0.2.23 (2025-7-31)

- fix: adaptStreamToOldFormat not handling new JSON output structure correctly

## 0.2.22 (2025-7-30)

- fix(api): format granted amount in credit granted notification template

## 0.2.21 (2025-7-30)

- feat(api): integrate payment client to ensure meter starts correctly
- feat(core): add credit activation notifications and rename AHC to AIGNE Hub Credits

## 0.2.20 (2025-7-30)

- fix: createTextCompletionApi doesn’t work in non-stream mode

## 0.2.19 (2025-7-29)

- chore: format AIGNE Hub config error message

## 0.2.18 (2025-7-29)

- fix: incorrect response type in chat completions (stream mode)

## 0.2.17 (2025-7-28)

- fix(ui): adjust tooltip placement and responsive styles for credit rate formula
- refactor(pkg): simplify API calls and improve type organization

## 0.2.16 (2025-7-28)

- feat(core): add user info API and UserCreditCard component

## 0.2.15 (2025-7-26)

- feat(api): move event subscription logic to separate listener module

## 0.2.14 (2025-7-25)

- chore: update dependencies
- feat(core): add pricing links menu and improve model cost input UI
- feat(core): add lock mechanism and prevent duplicate credit grant processing
- feat(api): add CustomError handling
- fix(core): improve credit payment link handling and fix getter/setter grouping
- chore: update logo

## 0.2.13 (2025-7-23)

- chore: support trace span from playground

## 0.2.12 (2025-7-23)

- refactor(api): simplify key assignment in credential mapping for improved readability
- feat(api): add CreditError and StatusCodeError for improved error handling
- feat(api): improve AI model configuration by adding support for default provider fallback and enhancing error handling
- feat(api): enhance model retrieval by filtering enabled AI providers

## 0.2.11 (2025-7-23)

- refactor(api): remove session middleware from service routes

## 0.2.10 (2025-7-22)

- feat(api): support /api/ai-providers/chat/models to get available models
- feat(api): add audio transcription and speech endpoints with OpenAI proxy

## 0.2.9 (2025-7-22)

- fix(api): update customer ID retrieval in getUserCredits function

## 0.2.8 (2025-7-22)

- feat(docs): update blocklet documentation with supported AI providers, core capabilities, and troubleshooting sections
- fix(api): update eventbus import path in listen.ts

## 0.2.7 (2025-7-21)

- feat: enhance AIGNE Hub with multi-provider support, credit billing, and updated documentation
- rename @blocklet/ai-kit to @blocklet/aigne-hub

## 0.2.6 (2025-7-21)

- fix: downgrade express to 4.x

## 0.2.5 (2025-7-18)

feat: support multi-provider ai integration and credit-based billing system

## 0.2.4 (2025-7-17)

- fix: format model name

## 0.2.3 (2025-7-16)

- fix: bundle code not working

## 0.2.2 (2025-7-15)

- chore: update package to latest

## 0.2.1 (2025-7-14)

- feat: update aigne framework models

## 0.2.0 (2025-7-8)

- feat(deps): major framework upgrades

## 0.1.79 (2025-6-6)

- chore: update deps

## 0.1.78 (2025-5-20)

- fix: enhance image preview component

## 0.1.77 (2025-5-20)

- chore: update deps

## 0.1.76 (2025-5-18)

- feat: add timeout option to imageGenerations

## 0.1.75 (2025-5-12)

- chore: update deps

## 0.1.74 (2025-4-28)

- feat: support gpt-image-1 image edit

## 0.1.73 (2025-4-25)

- feat: support gpt-image-1

## 0.1.72 (2025-3-17)

- chore: update deps

## 0.1.71 (2025-2-25)

- fix: support multi function calls

## 0.1.70 (2025-2-21)

- fix: remove empty parameters for gemini function calling

## 0.1.69 (2025-2-20)

- chore: update deps

## 0.1.68 (2025-2-18)

- fix: correct function calling response

## 0.1.67 (2025-2-5)

- chore: update deps

## 0.1.66 (2024-12-5)

- chore: update deps

## 0.1.65 (2024-11-12)

- chore: polish screenshots

## 0.1.64 (2024-11-10)

- chore: polish screenshots

## 0.1.62 (2024-10-31)

- chore: update @blocklet/sdk

## 0.1.61 (2024-10-30)

- chore: upgrade @blocklet/sdk

## 0.1.60 (2024-10-29)

- chore: add access logger
- chore: auto remove empty string from request

## 0.1.59 (2024-10-16)

- fix: remove config watcher that not working in docker mode

## 0.1.58 (2024-10-6)

- feat: add json_schema support

## 0.1.57 (2024-9-29)

- chore: update deps

## 0.1.56 (2024-9-26)

- chore: optimize image previewer by image service

## 0.1.55 (2024-9-25)

- feat: add open graph support

## 0.1.54 (2024-9-24)

- chore: use fetch instead of axios to support csrf

## 0.1.51 (2024-9-23)

- chore: update deps

## 0.1.50 (2024-9-11)

- chore: skip dotenv config for non-development environments

## 0.1.49 (2024-9-11)

- chore: ignore auth validation for meilisearch embeddings api

## 0.1.48 (2024-9-11)

- chore: avoid access other blocklet data dir

## 0.1.47 (2024-8-19)

- feat: add embeddings api for meilisearch ai powered search

## 0.1.46 (2024-8-6)

- chore: update deps

## 0.1.45 (2024-7-16)

- chore: enable sqlite wal mode for better performance

## 0.1.44 (2024-7-9)

- chore: update deps

## 0.1.43 (2024-6-24)

- chore: rethrow the error with the error type

## 0.1.42 (2024-6-22)

- chore: update deps

## 0.1.41 (2024-6-21)

- chore: set success color for the alert after the subscription activated

## 0.1.40 (2024-6-20)

- fix: show switch ai service button in the error view

## 0.1.39 (2024-6-20)

- fix: avoid read ai-kit config from other blocklets

## 0.1.38 (2024-6-20)

- chore: ensure blocklet works in isolation mode

## 0.1.37 (2024-6-6)

- feat: return usage in stream response

## 0.1.36 (2024-5-28)

- fix: force customer account for subscription detail url

## 0.1.35 (2024-5-28)

- feat: support response_format parameter for the chat completion api

## 0.1.34 (2024-5-24)

- chore: update deps

## 0.1.33 (2024-5-14)

- chore: support tool choice

## 0.1.32 (2024-5-13)

- fix: forward search params to ai-kit service

## 0.1.31 (2024-5-10)

- fix: disable accel-buffering for nginx & only pass necessary headers in proxy

## 0.1.30 (2024-5-4)

- fix: use switchDid instead of switchPassport

## 0.1.29 (2024-4-30)

- chore: update deps

## 0.1.28 (2024-4-28)

- chore: update deps

## 0.1.27 (2024-4-19)

- chore: chore: remove /config permission logic

## 0.1.26 (2024-3-26)

- fix: add a link to subscription detail page

## 0.1.25 (2024-3-22)

- chore: update deps

## 0.1.24 (2024-3-15)

- chore: change to pnpm

## 0.1.23 (2024-3-12)

- fix: use async fs functions

## 0.1.22 (2024-3-9)

- chore: bump version

## 0.1.21 (2024-3-6)

- fix: determine the current env through `config.env.mode`

## 0.1.20 (2024-3-6)

- fix: correct directory of db migrations

## 0.1.19 (2024-2-29)

- chore: use external tiktoken dep

## 0.1.18 (2024-2-29)

- fix: the end time of the query for usage should include the end day
- fix: use wasm tiktoken calc token usage

## 0.1.17 (2024-2-28)

- feat: bundle uses a compact mode

## 0.1.16 (2024-2-27)

- fix: correct description of subscription

## 0.1.15 (2024-2-27)

- feat: support disable token usage calculating

## 0.1.14 (2024-2-20)

- fix: stop counting when there is an error

## 0.1.13 (2024-2-20)

- fix: auto update subscription description after app name updated

## 0.1.12 (2024-2-18)

- chore: update deps

## 0.1.11 (2024-2-18)

- chore: update deps

## 0.1.10 (2024-2-7)

- chore: update deps

## 0.1.9 (2024-2-2)

- chore: update deps

## 0.1.8 (2024-1-31)

- chore: upgrade @arcblock and @blocklet deps

## 0.1.7 (2024-1-29)

- fix: type error

## 0.1.6 (2024-1-29)

- fix: type error

## 0.1.5 (2024-1-29)

- fix: enable subscription after subscribe succeed

## 0.1.4 (2024-1-29)

- chore: update deps
- fix: pass app name/url as description to payment

## 0.1.3 (2024-1-26)

- chore: upgrade immer to 10.x

## 0.1.2 (2024-1-26)

- chore: update deps
- fix: use event source parser parse gemini response

## 0.1.1 (2024-1-23)

- fix: correct exported module path

## 0.1.0 (2024-1-23)

- chore: use tsc bundle libs

## 0.0.121 (2024-1-23)

- fix: correct module of exported api

## 0.0.120 (2024-1-23)

- fix: support recover a subscription
- fix: wallet confirm when unsubscribing from the AI service

## 0.0.119 (2024-1-14)

- feat: handle exceptions

## 0.0.118 (2024-1-11)

- feat: remind users to subscribe in advance

## 0.0.117 (2024-1-11)

- fix: support unsubscribe
- chore: update deps

## 0.0.116 (2024-1-3)

- fix: billing page error

## 0.0.115 (2024-1-3)

- fix: config maybe empty

## 0.0.114 (2024-1-3)

- fix: expose status api

## 0.0.113 (2024-1-3)

- feat: support use ai kit service api

## 0.0.112 (2023-12-30)

- chore: update deps
- fix: correct logger parameters

## 0.0.111 (2023-12-30)

- fix: use logger instead of console

## 0.0.110 (2023-12-28)

- fix: catch error of usage reporting

## 0.0.109 (2023-12-28)

- fix: allow disable models not in the pricing list
- fix: show usage of local ai kit

## 0.0.108 (2023-12-28)

- fix: invalid openai base url

## 0.0.107 (2023-12-28)

- fix: correct usage report

## 0.0.106 (2023-12-28)

- fix: polish billing page

## 0.0.105 (2023-12-27)

- chore: update deps

## 0.0.104 (2023-12-27)

- fix: generic event stream

## 0.0.103 (2023-12-27)

- fix: use latest value of config

## 0.0.102 (2023-12-26)

- feat: add ai kit dashboard component

## 0.0.101 (2023-12-26)

- fix: disable nginx buffering in streaming api

## 0.0.100 (2023-12-26)

- fix: set 'X-Accel-Buffering' to 'no' to disable nginx buffering

## 0.0.99 (2023-12-25)

- fix: update exports of @blocklet/aigne-hub/api

## 0.0.98 (2023-12-25)

- chore: bump version

## 0.0.97 (2023-12-25)

- chore: bundle api with tsc-alias

## 0.0.96 (2023-12-25)

- feat: ai kit as service

## 0.0.95 (2023-12-23)

- fix: show login button in home page

## 0.0.94 (2023-12-19)

- chore: update tsconfig paths

## 0.0.93 (2023-12-18)

- fix: throw error if prompt has been blocked

## 0.0.92 (2023-12-18)

- fix: readable.toWeb require node v17

## 0.0.91 (2023-12-16)

- feat: support gemini

## 0.0.90 (2023-12-13)

fix: omit unused parameters of image generations

## 0.0.89 (2023-12-13)

- fix: only prompt parameter is required

## 0.0.88 (2023-12-1)

- fix: support custom openai url

## 0.0.87 (2023-11-29)

- fix: httpsProxy from process.env

## 0.0.86 (2023-11-27)

- fix: reactive configures

## 0.0.85 (2023-11-27)

- fix: reactive configures

## 0.0.84 (2023-11-26)

- fix: set empty tools array to undefined

## 0.0.83 (2023-11-24)

- fix: add parameters for tool call

## 0.0.82 (2023-11-23)

- feat: add function calling support

## 0.0.81 (2023-11-16)

- feat: add speech api

## 0.0.80 (2023-11-14)

- chore: set proxy url for ai
- chore: upgrade openai

## 0.0.79 (2023-11-13)

- feat: support dall-e-3

## 0.0.78 (2023-11-13)

- fix: ignore null or empty string value for temperature

## 0.0.77 (2023-11-1)

- fix: increase request body limit for audio transcriptions api

## 0.0.76 (2023-10-23)

- feat: add audio transcriptions api

## 0.0.75 (2023-10-16)

- chore: update deps
- fix: support more model parameters

## 0.0.74 (2023-10-9)

- fix: end error response

## 0.0.73 (2023-10-7)

- fix: include migration scripts

## 0.0.72 (2023-9-27)

- fix: check ai status

## 0.0.71 (2023-9-26)

- chore: update author and links
- chore: update deps

## 0.0.70 (2023-9-8)

- feat: add retry callback

## 0.0.69 (2023-9-6)

- chore: update deps

## 0.0.68 (2023-8-23)

- feat: support to use multiple apiKeys in turn
- feat: record tokens usage per request

## 0.0.67 (2023-8-16)

- fix: use smaller favicon
- chore: update deps

## 0.0.66 (2023-7-31)

- fix: remove compression middleware

## 0.0.65 (2023-7-27)

- fix: import lodash on demand

## 0.0.64 (2023-7-3)

- chore: update deps

## 0.0.63 (2023-6-27)

- chore: update deps
- feat: support logging ai input and output by `VERBOSE` env config

## 0.0.62 (2023-6-25)

- chore: update deps

## 0.0.61 (2023-6-19)

- chore: update deps

## 0.0.60 (2023-5-30)

- feat: support image response

## 0.0.59 (2023-5-27)

- feat: add embeddings api

## 0.0.58 (2023-5-24)

- chore: update deps

## 0.0.57 (2023-5-5)

- chore: update deps

## 0.0.56 (2023-4-24)

- chore: update deps

## 0.0.55 (2023-4-23)

- fix: max temperature is 2

## 0.0.54 (2023-4-23)

- feat: support config the model and temperature of ai

## 0.0.53 (2023-4-14)

- chore: update deps

## 0.0.52 (2023-4-13)

- feat: support multiple messages with different roles

## 0.0.51 (2023-4-10)

- fix: ignore enter event triggered by IME input
- fix: use `first-of-type` instead of `first-child`

## 0.0.50 (2023-4-7)

- fix: hide loading indicator after writing

## 0.0.49 (2023-4-6)

- fix: only show loading indicator when loading is true
- fix: default `enter` send prompt

## 0.0.48 (2023-3-30)

- feat: update sdk to 1.16.0

## 0.0.47 (2023-3-28)

- feat: render result with markdown

## 0.0.46 (2023-3-27)

- fix: correct type defines for api creator

## 0.0.45 (2023-3-27)

- feat: pass meta data out
- feat: support complete chat messages

## 0.0.44 (2023-3-23)

- fix: simplify the result of text completions
- chore: skip deploy

## 0.0.43 (2023-3-20)

- feat: support custom prompt props

## 0.0.42 (2023-3-17)

- fix: avoid submitting empty prompts
- fix: import dependencies as needed
- feat: upgrade blocklet sdk

## 0.0.41 (2023-3-16)

- fix: support custom scroll container

## 0.0.40 (2023-3-16)

- feat: support get the reference of prompt input

## 0.0.39 (2023-3-15)

- fix: reset loading status correctly

## 0.0.38 (2023-3-15)

- feat: support custom default messages

## 0.0.37 (2023-3-15)

- chore: upgrade prettier
- feat: support customer avatar renderer
- chore: upgrade vite

## 0.0.36 (2023-3-13)

- fix: catch error in error handler of express

## 0.0.35 (2023-3-13)

- fix: set default parameter type for created api

## 0.0.34 (2023-3-13)

- fix: allow custom parameter of created api

## 0.0.33 (2023-3-2)

- feat: upgrade text completions api

## 0.0.32 (2023-2-28)

- fix: translate admin menu

## 0.0.31 (2023-2-27)

- fix: timeout is optional

## 0.0.30 (2023-2-25)

- fix: add missing export

## 0.0.29 (2023-2-25)

- fix: remove useless hooks
- chore: remove eslint deps from packages/ai-kit
- feat: add `Conversation` component
- style: remove unnecessary comment
- fix: correctly display error message

## 0.0.28 (2023-2-23)

- chore: build @blocklet/aigne-hub before release bundle

## 0.0.27 (2023-2-22)

- fix: @blocklets/core bump version error

## 0.0.26 (2023-2-22)

- fix: remove template support

## 0.0.25 (2023-2-22)

- fix: resolve npm publish error

## 0.0.24 (2023-2-22)

- feat: support preview image in chat

## 0.0.23 (2023-2-15)

- fix: incorrect express error handing middleware

## 0.0.22 (2023-2-14)

- fix: validate request body by Joi
- feat: support generate image

## 0.0.21 (2023-2-10)

- fix: disable module preload
- feat: support copy template to clipboard

## 0.0.20 (2023-2-9)

- fix: remove nanoid version resolution

## 0.0.19 (2023-2-9)

- feat: template playground

## 0.0.18 (2023-2-8)

- fix: redirect to `/` if does not have permission
- docs: update blocklet.zh.md

## 0.0.17 (2023-2-6)

- fix: show loaded response after an error is raised

## 0.0.16 (2023-2-6)

- chore: add issue template

## 0.0.15 (2023-2-3)

- chore: auto upload to prod store

## 0.0.14 (2023-2-3)

- docs: update readme

## 0.0.13 (2023-2-3)

- docs: update blocklet.md
- fix: full width header

## 0.0.12 (2023-2-2)

- fix: add `/api/sdk/status` api for component.call

## 0.0.11 (2023-2-2)

- fix: remove useless env `CHAIN_HOST`

## 0.0.10 (2023-2-2)

- fix: auto scroll to bottom
- fix: support stop ai typing
- fix: show a blink caret when AI is typing
- fix: support copy message
- fix: support api timeout

## 0.0.9 (2023-2-2)

- fix: add home page
- chore: update deps
- fix: wrap playground in dashboard

## 0.0.8 (2023-2-2)

- fix: update blocklet's description
- fix: enlarge logo and favicon

## 0.0.7 (2023-1-31)

- Revert "fix: public completions api (#8)"

## 0.0.6 (2023-1-31)

- fix: public completions api

## 0.0.5 (2023-1-31)

- fix: new logo

## 0.0.4 (2023-1-30)

- fix: add welcome prompt
- fix: align text and avatar
- feat: support stream response
- feat: add `/api/sdk/completions` api for component call

## 0.0.3 (2023-1-30)

- fix: update api path to `/v1/completions`
- fix: show error message from openai
- fix: show avatar of conversation
- fix: auto scroll into view
- fix: sticky header and footer
- fix: use nanoid as conversation id
- fix: use form submit instead of `Enter` listener
- chore: add bump-version script in workspace root
- chore: move version file to workspace root

## 0.0.2 (2023-1-29)

- feat: playground page
