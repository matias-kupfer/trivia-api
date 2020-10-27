import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as cors from 'cors';

import * as express from 'express';
// const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
    // credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://trivia-e9cfe.firebaseio.com"
});

// Express config
const app = express();
app.use(cors({origin: true}));
app.use(express.json());

// API
export const helloWorld = functions.https.onRequest((request, response) => {
    response.json("Hello world from matias kupfer - Trivia backend");
});

app.post('/', (request, response) => {
    response.send('Hello from the other side!');
});

// Route middlewares
import {playRoute} from "./Routes/play";

app.use('/play/', playRoute);


exports.api = functions.https.onRequest(app);
// app.listen(3000, () => console.log('Server up and running'));
// firebase serve
// firebase emulators:start
// tsc --w
