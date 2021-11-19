import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { collection, doc, getDoc } from "firebase/firestore"; 

const app = initializeApp((window as any).config.firebase);
const db = getFirestore(app);

export async function watcher(token: string, repo: string, cb: () => void) {
  try {
    const auth = getAuth(app);
    signInWithCustomToken(auth, token)
      .then(creds => {
        return creds?.user;
      })
      .then(async user => {
        const repos = collection(db, "repos");
        const repoDoc = await getDoc(doc(db, repo));
      })
      .then(() => {
        cb();
      })
  } catch (error) {
    console.error("failed to watch", error);
    throw error;
  }
  return () => {};
}
