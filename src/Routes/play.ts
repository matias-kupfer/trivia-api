import * as express from 'express';
import * as https from 'https';
import * as admin from "firebase-admin";
import {Question} from "../interfaces/question";
import DocumentSnapshot = admin.firestore.DocumentSnapshot;
import DocumentData = admin.firestore.DocumentData;

export const playRoute = express.Router();
const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;
const gamesCollection = 'games';

/*
* All the request start with /api/play
* */

/* CREATE the game */
playRoute.post('/createGame/:selectedCategory/:username/:gameId/:gamePassword?', async (req, res) => {
    const selectedCategory = req.params.selectedCategory;
    const username = req.params.username;
    const gameId = req.params.gameId;
    const gamePassword = req.params.gamePassword ? req.params.gamePassword : null;

    /*
    * Check if gameId is available
    * */
    await checkGameId(gameId).get().then((docSnapshot: DocumentSnapshot<DocumentData>) => {
        if (!docSnapshot.exists) {
            /*
            * Game does NOT exist, gameId IS available
            * */
            const newGameRef = db.collection('games').doc(gameId);
            newGameRef.set({
                gameId: gameId,
                gamePassword: gamePassword,
                host: username,
                selectedCategory,
                gameStarted: false,
                gameFinished: false,
                players: [username],
                winners: [],
                round: null,
            }).then(() => { // game created
                res.json({
                    success: true,
                    message: 'Created ' + gameId + ' game as ' + username,
                });
                const playersRef = newGameRef.collection('players').doc(username);
                playersRef.set({playerAnswers: [], username}).catch((e) => console.log(e))
            }).catch(e => { // error creating game
                console.log(e);
                res.json({
                    success: false,
                    message: 'error creating the game',
                })
            });
        } else {
            res.json({ // gameId already exists
                success: false,
                message: 'game ' + gameId + ' already exists, try another name'
            })
        }
    })
});

/* START the game */
playRoute.post('/startGame/:selectedCategory/:username/:gameId/:gamePassword?', async (req, res) => {
    const selectedCategory = req.params.selectedCategory;
    // const username = req.params.username;
    const gameId = req.params.gameId;
    // const gamePassword = req.params.gamePassword ? req.params.gamePassword : null;
    /*
    * Check if game exists
    * */
    await checkGameId(gameId).get().then(docSnapshot => {
        // todo check if password correct in case it is private
        // @ts-ignore
        if (docSnapshot.exists && !docSnapshot._fieldsProto.gameStarted.booleanValue) {
            /*
            * Game DOES exist and is NOT started
            * Request to trivia api
            * */
            let triviaQuery = 'https://opentdb.com/api.php?amount=4&category=';
            triviaQuery = `${triviaQuery}${selectedCategory}`;
            https.get(triviaQuery, (resp) => {
                if (resp.statusCode == 200) { // success
                    let data = '';
                    resp.on('data', chunk => {
                        data += chunk;
                    })

                    resp.on('end', () => {
                        const questions: Question[] = [];
                        JSON.parse(data).results.map((question: Question, index: number) => {
                            /*
                            * Remove custom object properties
                            * */
                            questions.push(JSON.parse(JSON.stringify(shuffleAnswers(question))));
                        });
                        /*
                        * Upload questions tu firebase
                        * */
                        db.collection(gamesCollection).doc(gameId)
                            .update({gameStarted: true, questions, round: 0}).then(() => {
                            res.json({success: true})
                        }).catch((e) => res.json({success: false}))
                    })
                } else {
                    /*
                    * In case of failed request (not http 200) return {success: false}
                    * */
                    res.json({success: false})
                }
            });
        } else {
            /*
            * Game already started or not found
            * */
            // @ts-ignore
            !docSnapshot.exists
                ? res.json({success: false, message: 'Game does NOT exist'})
                : res.json({success: false, message: 'Game already started'})
        }
    }).catch((e) => console.log(e));
});

/* START the game */
playRoute.post('/joinGame/:username/:gameId/:gamePassword?', async (req, res) => {
    const username = req.params.username;
    const gameId = req.params.gameId;
    const gamePassword = req.params.gamePassword ? req.params.gamePassword.toString() : null;

    await checkGameId(gameId).get().then((docSnapshot: DocumentSnapshot<DocumentData>) => {
        if (docSnapshot.exists &&
            // @ts-ignore
            !docSnapshot._fieldsProto.gameStarted.booleanValue &&
            !usernameTaken(username, docSnapshot)) {
            /*
            * Game DOES exist, Username IS available and game is NOT started
            * */
            // @ts-ignore
            if (docSnapshot._fieldsProto.gamePassword.stringValue !== gamePassword) {
                res.json({
                    success: false,
                    message: 'Incorrect password, try again',
                });
                return;
            }
            const gameRef = db.collection('games').doc(gameId);
            gameRef.update({players: fieldValue.arrayUnion(username)})
                /*
                * Add player to game players list
                * */
                .then(() => {
                    const playersRef = gameRef.collection('players').doc(username);
                    playersRef.set({playerAnswers: [], username})
                        /*
                        * Create subcollection to save user answers
                        * */
                        .then(() => res.json({
                            success: true,
                            message: 'Joined ' + gameId + ' game as ' + username,
                        }))
                        .catch((e) => res.json({success: false}))
                }).catch((e) => res.json({success: false}));
        } else {
            /*
            * Game already started, username taken or game not found
            * */
            // @ts-ignore
            !docSnapshot.exists
                ? res.json({success: false, message: 'Game does NOT exist'})
                : usernameTaken(username, docSnapshot)
                ? res.json({success: false, message: 'Username is taken, try another'})
                : res.json({success: false, message: 'Game already started'})
        }
    }).catch((e) => console.log(e));
});

/* FUNCTIONS */
function checkGameId(gameId: string) {
    return db.collection('games').doc(gameId);
}

function shuffleAnswers(question: Question) {
    /*
    * Add correct answers to answers array and shuffle answers
    * */
    const allAnswers: string[] = [];
    question.incorrect_answers.map(incorrect_answer => {
        allAnswers.push(incorrect_answer);
    })
    allAnswers.push(question.correct_answer);
    for (let i = allAnswers.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
    }
    question.incorrect_answers = allAnswers;
    return question;
}

function usernameTaken(newUsername: any, docSnapshot: any) {
    let isTaken = false;
    docSnapshot.data().players.map((username: any) => {
        if (username === newUsername) isTaken = true;
    });
    return isTaken;
}

// @ts-ignore
