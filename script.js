// 🔥 Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
  authDomain: "up-to-battle.firebaseapp.com",
  projectId: "up-to-battle",
  storageBucket: "up-to-battle.appspot.com",
  messagingSenderId: "328069667156",
  appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

// 🔹 Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 🔹 Enable Session Persistence
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log("Persistence enabled: User stays logged in.");
  })
  .catch((error) => {
    console.error("Error enabling persistence:", error);
  });

// DOM references
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const welcomeUser = document.getElementById("welcome-user");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

const commentForm = document.getElementById("commentForm");
const commentTextInput = document.getElementById("commentText");
const commentList = document.getElementById("commentList");

// 🔹 Handle UI Updates When User Logs In/Out
auth.onAuthStateChanged((user) => {
  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    welcomeUser.innerText = `Welcome, ${user.email}!`;
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    welcomeUser.innerText = "";
  }
});

// 🔹 Handle User Login
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      alert("Login successful!");
      loginForm.reset();
      closeModal();
    })
    .catch((error) => {
      console.error("Login Error:", error.code, error.message);
      alert(error.message);
    });
});

// 🔹 Handle User Signup
signupForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      alert("Sign-up successful!");
      signupForm.reset();
      closeSignupModal();
    })
    .catch((error) => {
      console.error("Signup Error:", error.code, error.message);
      alert(error.message);
    });
});

// 🔹 Handle User Logout
function logout() {
  auth.signOut()
    .then(() => {
      alert("Logged out successfully!");
    })
    .catch((error) => {
      console.error("Logout Error:", error);
      alert(error.message);
    });
}

// 🔹 Handle Comment Submission
commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    alert("You must be logged in to comment!");
    return;
  }

  const commentText = commentTextInput.value.trim();

  if (!commentText) {
    alert("Please enter a comment.");
    return;
  }

  try {
    await db.collection("comments").add({
      username: user.email,
      comment: commentText,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      likes: 0,
      uid: user.uid
    });

    commentTextInput.value = "";
  } catch (error) {
    console.error("Error adding comment:", error);
    alert("Failed to post comment.");
  }
});

// 🔹 Load Comments from Firestore
function loadComments() {
  db.collection("comments")
    .orderBy("timestamp", "desc")
    .onSnapshot(
      (snapshot) => {
        commentList.innerHTML = "";

        if (snapshot.empty) {
          commentList.innerHTML = `<p style="color:#a7b0d6;">No comments yet. Be the first to post.</p>`;
          return;
        }

        snapshot.forEach((doc) => {
          const commentData = doc.data();
          const commentId = doc.id;

          const timestamp = commentData.timestamp
            ? new Date(commentData.timestamp.toDate()).toLocaleString()
            : "Just now";

          const commentElement = document.createElement("div");
          commentElement.classList.add("comment");

          commentElement.innerHTML = `
            <div class="comment-header">
              <span class="comment-user">${escapeHTML(commentData.username || "Anonymous")}</span>
              <span class="comment-time">${timestamp}</span>
            </div>
            <p class="comment-text">${escapeHTML(commentData.comment || "")}</p>
            <div class="comment-actions">
              <button class="like-btn" onclick="likeComment('${commentId}')">👍 Like</button>
              <span class="likes-count">Likes: <span id="likes-${commentId}">${commentData.likes || 0}</span></span>
            </div>
          `;

          commentList.appendChild(commentElement);
        });
      },
      (error) => {
        console.error("Error loading comments:", error);
        commentList.innerHTML = `<p style="color:#ff9c9c;">Failed to load comments.</p>`;
      }
    );
}

// 🔹 Handle Likes
async function likeComment(commentId) {
  const commentRef = db.collection("comments").doc(commentId);

  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(commentRef);
      if (!doc.exists) return;

      const newLikes = (doc.data().likes || 0) + 1;
      transaction.update(commentRef, { likes: newLikes });
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    alert("Failed to like comment.");
  }
}

// 🔹 Prevent HTML injection in comments
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 🔹 Modal Functions
function openModal() {
  document.getElementById("login-modal").style.display = "block";
}

function closeModal() {
  document.getElementById("login-modal").style.display = "none";
}

function showSignup() {
  closeModal();
  document.getElementById("signup-modal").style.display = "block";
}

function closeSignupModal() {
  document.getElementById("signup-modal").style.display = "none";
}

function switchToLogin() {
  closeSignupModal();
  openModal();
}

// 🔹 Close modal when clicking outside
window.addEventListener("click", (e) => {
  const loginModal = document.getElementById("login-modal");
  const signupModal = document.getElementById("signup-modal");

  if (e.target === loginModal) closeModal();
  if (e.target === signupModal) closeSignupModal();
});

// 🔹 Load comments on page start
loadComments();
