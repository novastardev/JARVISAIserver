// Database bootstrap for JARVIS AI.
//
// If MONGO_URI is supplied, use the configured MongoDB server.
// Otherwise start a MongoDB instance inside this Render web-service process.
// The embedded instance uses temporary service storage: data is lost when the
// Render instance is replaced, restarted, or redeployed.
async function connectDatabase({
    mongoose,
    mongoUri = process.env.MONGO_URI,
    createEmbeddedServer,
    logger = console
} = {}) {
    if (!mongoose || typeof mongoose.connect !== 'function') {
        throw new TypeError('A valid Mongoose instance is required.');
    }

    if (mongoose.connection?.readyState === 1) {
        return { mode: mongoUri ? 'external' : 'already-connected', embeddedServer: null };
    }

    let embeddedServer = null;
    let uri = String(mongoUri || '').trim();
    let mode = 'external';

    if (!uri) {
        mode = 'embedded-ephemeral';
        const startServer = createEmbeddedServer || (async () => {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            return MongoMemoryServer.create({
                instance: { dbName: 'jarvis_ai' }
            });
        });

        logger.warn?.(
            '⚠️ MONGO_URI is not set. Starting embedded MongoDB in this Render service. ' +
            'Database contents are temporary and may be lost on restart or redeploy.'
        );
        embeddedServer = await startServer();
        uri = embeddedServer.getUri();
    }

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        logger.log?.(
            mode === 'external'
                ? '✅ External MongoDB Connected'
                : '✅ Embedded MongoDB Connected (temporary storage)'
        );
        return { mode, embeddedServer };
    } catch (error) {
        if (embeddedServer) {
            await embeddedServer.stop().catch(() => {});
        }
        throw error;
    }
}

async function closeDatabase({ mongoose, embeddedServer } = {}) {
    if (mongoose?.connection?.readyState) {
        await mongoose.disconnect();
    }
    if (embeddedServer) {
        await embeddedServer.stop();
    }
}

module.exports = { connectDatabase, closeDatabase };
