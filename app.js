const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

const dbPath = path.join(__dirname, 'twitterClone.db');
let db;

app.use(express.json());

const initializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });

        app.listen(3001, () => {
            console.log('Server Running at http://localhost:3001/');
        });
    } catch (e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    }
};

initializeDBAndServer();

// Middleware to check JWT token
const authenticateToken = (request, response, next) => {
    let jwtToken;
    const authHeader = request.headers['authorization'];
    if (authHeader !== undefined) {
        jwtToken = authHeader.split(' ')[1];
    }
    if (jwtToken === undefined) {
        response.status(401).send('Invalid JWT Token');
    } else {
        jwt.verify(jwtToken, 'Abcde', async (error, payload) => {
            if (error) {
                response.status(401).send('Invalid JWT Token');
            } else {
                request.username = payload.username;
                next();
            }
        });
    }
};

app.post('/register/', async (request, response) => {
    const { username, name, password, gender } = request.body;
    if (password.length < 6) {
        response.status(400).send('Password is too short');
        return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser) {
        response.status(400).send('User already exists');
    } else {
        const createUserQuery = `
            INSERT INTO 
            user (username, name, password, gender) 
            VALUES 
            ('${username}', '${name}', '${hashedPassword}', '${gender}')`;
        await db.run(createUserQuery);
        response.send('User created successfully');
    }
});

app.post('/login', async (request, response) => {
    const { username, password } = request.body;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (!dbUser) {
        response.status(400).send('Invalid user');
    } else {
        const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
        if (isPasswordMatched) {
            const payload = {
                username: username,
            };
            const jwtToken = jwt.sign(payload, 'Abcde');
            response.send({ jwtToken });
        } else {
            response.status(400).send('Invalid password');
        }
    }
});

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
    const { username } = request;
    const getFeedQuery = `
        SELECT 
        tweet.tweet,
        tweet.date_time
        FROM 
        tweet
        INNER JOIN follower ON tweet.user_id = follower.following_user_id
        INNER JOIN user ON user.user_id = follower.follower_user_id
        WHERE
        user.username = '${username}'
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
    const feed = await db.all(getFeedQuery);
    response.send(feed);
});

app.get('/user/tweets/', authenticateToken, async (request, response) => {
    const { username } = request;
    const getUserTweetsQuery = `
        SELECT 
        tweet.tweet,
        tweet.date_time
        FROM 
        tweet
        INNER JOIN user ON user.user_id = tweet.user_id
        WHERE
        user.username = '${username}'
        ORDER BY tweet.date_time DESC;
    `;
    const userTweets = await db.all(getUserTweetsQuery);
    response.send(userTweets);
});

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetUserQuery = `
        SELECT 
        user.username
        FROM 
        user
        INNER JOIN tweet ON tweet.user_id = user.user_id
        WHERE
        tweet.tweet_id = ${tweetId};
    `;
    const tweetUser = await db.get(getTweetUserQuery);
    if (!tweetUser || tweetUser.username !== username) {
        response.status(401).send('Invalid Request');
        return;
    }
    const getTweetQuery = `
        SELECT 
        tweet.tweet,
        tweet.date_time
        FROM 
        tweet
        WHERE
        tweet.tweet_id = ${tweetId};
    `;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
});

app.get('/tweets/:tweetId/likes/', authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetUserQuery = `
        SELECT 
        user.username
        FROM 
        user
        INNER JOIN tweet ON tweet.user_id = user.user_id
        WHERE
        tweet.tweet_id = ${tweetId};
    `;
    const tweetUser = await db.get(getTweetUserQuery);
    if (!tweetUser || tweetUser.username !== username) {
        response.status(401).send('Invalid Request');
        return;
    }
    const getLikesQuery = `
        SELECT 
        user.username
        FROM 
        user
        INNER JOIN likes ON likes.user_id = user.user_id
        WHERE
        likes.tweet_id = ${tweetId};
    `;
    const likes = await db.all(getLikesQuery);
    response.send({ likes: likes.map(like => like.username) });
});

app.get('/user/following/', authenticateToken, async (request, response) => {
    const { username } = request;
    const getFollowingQuery = `
        SELECT 
        user.name
        FROM 
        user
        INNER JOIN follower ON user.user_id = follower.following_user_id
        INNER JOIN user AS u ON u.user_id = follower.follower_user_id
        WHERE
        u.username = '${username}';
    `;
    const following = await db.all(getFollowingQuery);
    response.send(following);
});

app.get('/user/followers/', authenticateToken, async (request, response) => {
    const { username } = request;
    const getFollowersQuery = `
        SELECT 
        user.name
        FROM 
        user
        INNER JOIN follower ON user.user_id = follower.follower_user_id
        INNER JOIN user AS u ON u.user_id = follower.following_user_id
        WHERE
        u.username = '${username}';
    `;
    const followers = await db.all(getFollowersQuery);
    response.send(followers);
});

app.get('/tweets/:tweetId/replies/', authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetUserQuery = `
        SELECT 
        user.username
        FROM 
        user
        INNER JOIN tweet ON tweet.user_id = user.user_id
        WHERE
        tweet.tweet_id = ${tweetId};
    `;
    const tweetUser = await db.get(getTweetUserQuery);
    if (!tweetUser || tweetUser.username !== username) {
        response.status(401).send('Invalid Request');
        return;
    }
    const getRepliesQuery = `
        SELECT 
        user.name,
        reply.reply,
        reply.date_time
        FROM 
        reply
        INNER JOIN user ON user.user_id = reply.user_id
        WHERE
        reply.tweet_id = ${tweetId}
        ORDER BY reply.date_time DESC;
    `;
    const replies = await db.all(getRepliesQuery);
    response.send({ replies });
});

app.post('/user/tweets/', authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweet } = request.body;
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const user = await db.get(getUserQuery);
    if (!user) {
        response.status(401).send('Invalid JWT Token');
        return;
    }
    const insertTweetQuery = `
        INSERT INTO 
        tweet (tweet, user_id, date_time)
        VALUES 
        ('${tweet}', ${user.user_id}, datetime('now'));
    `;
    await db.run(insertTweetQuery);
    response.send('Created a Tweet');
});

app.delete('/tweets/:tweetId/', authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetUserQuery = `
        SELECT 
        user.username
        FROM 
        user
        INNER JOIN tweet ON tweet.user_id = user.user_id
        WHERE
        tweet.tweet_id = ${tweetId};
    `;
    const tweetUser = await db.get(getTweetUserQuery);
    if (!tweetUser || tweetUser.username !== username) {
        response.status(401).send('Invalid Request');
        return;
    }
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
    await db.run(deleteTweetQuery);
    response.send('Tweet Removed');
});

module.exports = app;