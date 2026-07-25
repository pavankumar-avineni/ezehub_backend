import admin from 'firebase-admin';

let firebaseAuth = null;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount || process.env.FIREBASE_PROJECT_ID) {
    const app = admin.initializeApp({
      credential: serviceAccount
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    firebaseAuth = app.auth();
    console.log('Firebase Admin initialized');
  } else {
    console.log('Firebase not configured — skipping initialization');
  }
} catch (err) {
  console.warn('Firebase init failed:', err.message);
}

export { firebaseAuth };
export default admin;
