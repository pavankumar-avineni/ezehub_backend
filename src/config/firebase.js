import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// In production, use GOOGLE_APPLICATION_CREDENTIALS env variable pointing to service account JSON
// Or pass the service account directly via FIREBASE_SERVICE_ACCOUNT env variable (JSON string)

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const firebaseAuth = admin.auth();
export default admin;
