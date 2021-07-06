import { WebClient } from '@slack/web-api'
import { json, urlencoded } from 'body-parser'
import express, { Request, Response } from 'express'
import { NextFunction } from 'express-serve-static-core'
import { BadRequest } from 'http-errors'
import Storage from './src/storage'

const VERIFICATION_TOKEN = process.env.VERIFICATION_TOKEN
const TOKEN = process.env.TOKEN // @todo will be used the oauth2 approach for exchanging tokens

const app = express()

// add json parser
app.use(json())
app.use(urlencoded())

app.post('/event', async ({ body }: Request<any, ResponseBody, RequestBody>, res: Response<ResponseBody>, next: NextFunction) => {
  const { type, token } = body

  if (token !== VERIFICATION_TOKEN) {
    return next(new BadRequest('Invalid request token'))
  }

  if (type !== 'url_verification' && type !== 'event_callback') {
    return next(new BadRequest('Invalid request event type'))
  }

  // handle url verification
  if (type === 'url_verification') {
    return res.send({
      challenge: body.challenge
    })
  }

  const { event, event_id } = body;

  if (event.type !== 'message') return next(new BadRequest('Invalid event received'))

  const client = new WebClient(TOKEN)

  console.log('Processing event [%s]', event_id)

  return new Promise((resolve) => {
    // If the message is from the bot we then ignore the event and marked it as successful
    if (event.bot_id !== undefined) {
      console.log('Event [%s] is from bot ignoring.', event_id)
      return resolve(false)

    }

    console.log('Attempting to lookup for configured auto response for user [%s]', event.user)

    const storage = new Storage;

    storage.findUserConfiguration(event.user)
      .then((config) => {
        if (config === undefined) {
          console.log('No configured auto response for user [%s]. Ignoring..', event.user)
          return undefined
        }

        console.log('Found configuration for user [%s]. Attempting to post a message..', event.user)

        return client.chat.postMessage({
          channel: event.channel,
          text: config.reply_message,
        })
      })
      .then(resolve);
  })
    .then(() => res.send())
    .finally(() => console.log('Event [%s] processed successfully.', event_id))
})

app.listen(8080, () => {
  console.log('⚡️[server]: Server is running at http://localhost:8080')
})

interface VerificationResponseBody {
  /**
   * The contains the received challenged from the app verification process
   *
   * @readonly
   *
   * @type {string}
   */
  readonly challenge: string
}

interface BaseEventPayload {
  /**
   * This deprecated verification token is proof that the request is coming from Slack on behalf of your application.
   * You'll find this value in the "App Credentials" section of your app's application management interface.
   * Verifying this value is more important when working with real events after this verification sequence has been completed.
   * When responding to real events, always use the more secure signing secret process to verify Slack requests' authenticity
   *
   * @readonly
   *
   * @type {string}
   */
  readonly token: string
}

interface EventCallbackPayload extends BaseEventPayload {
  /**
   * Contains the inner set of fields representing the event that's happening.
   *
   * @readonly
   *
   * @type {Event}
   */
  readonly event: Event

  /**
   * A unique identifier for this specific event, globally unique across all workspaces
   *
   * @readonly
   *
   * @type {string}
   */
  readonly event_id: string
}

interface VerificationPayload extends BaseEventPayload {
  /**
   * A randomly generated string produced by Slack.
   * The point of this little game of cat and mouse is that you're going to respond to this request with a response body containing this value.
   *
   * @readonly
   *
   * @type {string}
   */
  readonly challenge: string

  /**
   * This payload is similarly formatted to other event types you'll encounter in the Events API.
   * To help you differentiate url verification requests form other event types, we inform you that this is of the `url_verification` variety.
   *
   * @readonly
   *
   * @type {'url_verification'}
   */
   readonly type: 'url_verification'
}

interface BaseEvent {
  /**
   * The specific name of the event described by its adjacent fields. This field is included with every inner event type.
   *
   * @readonly
   *
   * @type {string}
   */
  readonly type: string

  /**
   * The user ID belonging to the user that incited this action. Not included in all events as not all events are controlled by users.
   *
   * @readonly
   *
   * @type {string}
   */
  readonly user: string
}

interface Event extends BaseEvent {
  /**
   * The specific name of the event described by its adjacent fields. This field is included with every inner event type.
   *
   * @readonly
   *
   * @type {'message'}
   */
  readonly type: 'message'

  /**
   * The ID of the channel, private group or DM channel this message is posted in.
   *
   * @readonly
   *
   * @type {string}
   */
  readonly channel: string

  /**
   * The text spoken
   *
   * @readonly
   *
   * @type {string}
   */
  readonly text: string

  /**
   * Tells you which bot sent this message
   *
   * @readonly
   *
   * @type {string}
   */
  readonly bot_id?: string
}

type ResponseBody = VerificationResponseBody | undefined
type RequestBody = VerificationPayload & EventCallbackPayload


app.post('/command', (req: Request<any, any, CommandPayload>, res: Response) => {
  const storage = new Storage;
  const { user_id, text } = req.body;

  console.log('Processing configuration for user [%s]', user_id)

  return storage.storeConfiguration(user_id, { reply_message: text })
    .then((result) => {
      if (result === true) return res.send('You have enabled auto response.')

      return res.send('Sorry, im not able to do this for you.')
    }).finally(() => console.log('Processed configuration for user [%s]', user_id))
})

interface CommandPayload {
  /**
   * This is a verification token, a deprecated feature that you shouldn't use any more.
   * It was used to verify that requests were legitimately being sent by Slack to your app, but you should use the signed secrets functionality to do this instead.
   *
   * @readonly
   *
   * @type {string}
   */
  readonly token: string

  /**
   * The command that was typed in to trigger this request.
   * This value can be useful if you want to use a single Request URL to service multiple Slash Commands, as it lets you tell them apart.
   *
   * @readonly
   *
   * @type {string}
   */
  command: string

  /**
   * This is the part of the Slash Command after the command itself, and it can contain absolutely anything that the user might decide to type.
   * It is common to use this text parameter to provide extra context for the command.
   *
   * @readonly
   *
   * @type {string}
   */
  text: string

  /**
   * A temporary webhook URL that you can use to generate messages responses.
   *
   * @readonly
   *
   * @type {string}
   */
  response_url: string
  trigger_id: string
  user_id: string
  user_name: string
  api_app_id: string
}
