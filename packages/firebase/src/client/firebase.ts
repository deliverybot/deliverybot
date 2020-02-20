import firebase from "@firebase/app";
import "@firebase/auth";
import "@firebase/firestore";

firebase.initializeApp((window as any).config.firebase);
const auth = firebase.auth!();
const store = firebase.firestore!();

export async function watcher(token: string, repo: string, cb: () => void) {
  try {
    await auth.signInWithCustomToken(token);
    return store
      .collection("repos")
      .doc(`${repo}`)
      .onSnapshot(
        () => {
          cb();
        },
        (err: Error) => {
          console.error(err);
        },
      );
  } catch (error) {
    console.error("failed to watch", error);
    throw error;
  }
}
