import { MongoClient } from 'mongodb';

const MONGO_URI = "mongodb+srv://abdohamdy6:abdo123456@cluster0.qzwpsf2.mongodb.net/?appName=Cluster0";
let client = null;

export async function getDb() {
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  }
  return client.db("hamdy_quiz_db");
}