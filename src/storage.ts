import { MongoClient } from "mongodb";

export default class Storage {
  protected readonly client = new MongoClient('mongodb://mongo:27017', {
    auth: {
      user: 'root',
      password: 'example'
    }
  })

  storeConfiguration(user_id: string, config: UserConfig): Promise<boolean> {
    return this.client.connect()
      .then(
        (connection) => connection.db('chatbot').collection('users').updateOne({ user_id, }, {
          $set: {
            user_id,
            config,
          }
        }, {
          upsert: true,
        }).finally(() => connection.close())
      )
      .then((result) => result.upsertedCount > 0 || result.modifiedCount > 0)
  }

  findUserConfiguration(user_id: string): Promise<UserConfig|undefined> {
    return this.client.connect()
      .then(
        (connection) => connection.db('chatbot').collection('users').findOne<UserSchema>({ user_id })
          .finally(() => connection.close())
      )
      .then((result) => result?.config);
  }
}

interface UserSchema {
  user_id: string
  config: UserConfig
}

interface UserConfig {
  reply_message: string
}