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

- fix: avoid submiting empty prompts
- fix: import dependencies as needed
- feat: upgrade blocklet sdk

## 0.0.41 (2023-3-16)

- fix: suppoort custom scroll container

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

- fix: trnaslate admin menu

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

- chore: build @blocklet/ai-kit before release bundle

## 0.0.27 (2023-2-22)

- fix: @blocklets/ai-kit bump version error

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
