```javascript
// =========================================
// FIREBASE CONFIGURATION
// =========================================

const firebaseConfig = {
  apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
  authDomain: "up-to-battle.firebaseapp.com",
  projectId: "up-to-battle",
  storageBucket: "up-to-battle.appspot.com",
  messagingSenderId: "328069667156",
  appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

// =========================================
// INITIALIZE FIREBASE
// =========================================

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// =========================================
// ENABLE SESSION PERSISTENCE
// =========================================

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log("Persistence enabled: User stays logged in.");
  })
  .catch((error) => {
    console.error(
      "Error enabling persistence:",
      error
    );
  });

// =========================================
// DOM REFERENCES
// =========================================

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const welcomeUser = document.getElementById("welcome-user");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

const commentForm = document.getElementById("commentForm");
const commentTextInput = document.getElementById("commentText");
const commentList = document.getElementById("commentList");

const loginModal = document.getElementById("login-modal");
const signupModal = document.getElementById("signup-modal");

// =========================================
// AUTH MESSAGE HELPERS
// =========================================

function ensureMessageElement(form) {
  if (!form) {
    return null;
  }

  let messageEl = form.querySelector(".auth-message");

  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.className = "auth-message";

    form.appendChild(messageEl);
  }

  return messageEl;
}

function setFormMessage(form, text, type = "") {
  const messageEl = ensureMessageElement(form);

  if (!messageEl) {
    return;
  }

  messageEl.className =
    `auth-message ${type}`.trim();

  messageEl.textContent = text;
}

// =========================================
// AUTH STATE
// =========================================

auth.onAuthStateChanged((user) => {
  if (user) {
    // User is logged in

    if (loginBtn) {
      loginBtn.style.display = "none";
    }

    if (logoutBtn) {
      logoutBtn.style.display = "inline-flex";
    }

    if (welcomeUser) {
      welcomeUser.innerText =
        `Welcome, ${user.email}`;
    }

  } else {
    // User is logged out

    if (loginBtn) {
      loginBtn.style.display = "inline-flex";
    }

    if (logoutBtn) {
      logoutBtn.style.display = "none";
    }

    if (welcomeUser) {
      welcomeUser.innerText = "";
    }
  }
});

// =========================================
// LOGIN
// =========================================

if (loginForm) {
  loginForm.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      setFormMessage(
        loginForm,
        ""
      );

      const emailInput =
        document.getElementById("email");

      const passwordInput =
        document.getElementById("password");

      if (!emailInput || !passwordInput) {
        return;
      }

      const email =
        emailInput.value.trim();

      const password =
        passwordInput.value;

      try {
        await auth.signInWithEmailAndPassword(
          email,
          password
        );

        setFormMessage(
          loginForm,
          "Login successful.",
          "success"
        );

        loginForm.reset();

        setTimeout(() => {
          closeModal();
        }, 500);

      } catch (error) {
        console.error(
          "Login Error:",
          error.code,
          error.message
        );

        setFormMessage(
          loginForm,
          error.message,
          "error"
        );
      }
    }
  );
}

// =========================================
// SIGN UP
// =========================================

if (signupForm) {
  signupForm.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      setFormMessage(
        signupForm,
        ""
      );

      const emailInput =
        document.getElementById(
          "signup-email"
        );

      const passwordInput =
        document.getElementById(
          "signup-password"
        );

      if (!emailInput || !passwordInput) {
        return;
      }

      const email =
        emailInput.value.trim();

      const password =
        passwordInput.value;

      try {
        await auth.createUserWithEmailAndPassword(
          email,
          password
        );

        setFormMessage(
          signupForm,
          "Account created successfully.",
          "success"
        );

        signupForm.reset();

        setTimeout(() => {
          closeSignupModal();
        }, 700);

      } catch (error) {
        console.error(
          "Signup Error:",
          error.code,
          error.message
        );

        setFormMessage(
          signupForm,
          error.message,
          "error"
        );
      }
    }
  );
}

// =========================================
// LOGOUT
// =========================================

function logout() {
  auth.signOut()
    .then(() => {
      console.log(
        "Logged out successfully."
      );
    })
    .catch((error) => {
      console.error(
        "Logout Error:",
        error
      );

      alert(error.message);
    });
}

// =========================================
// COMMENT SUBMISSION
// =========================================

if (
  commentForm &&
  commentTextInput
) {
  commentForm.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      const user =
        auth.currentUser;

      // User must be logged in

      if (!user) {
        alert(
          "You must be logged in to comment."
        );

        openModal();

        return;
      }

      const commentText =
        commentTextInput.value.trim();

      if (!commentText) {
        alert(
          "Please enter a comment."
        );

        return;
      }

      try {
        await db
          .collection("comments")
          .add({
            username: user.email,

            comment: commentText,

            timestamp:
              firebase.firestore.FieldValue.serverTimestamp(),

            likes: 0,

            uid: user.uid
          });

        // Clear textarea

        commentTextInput.value = "";

      } catch (error) {
        console.error(
          "Error adding comment:",
          error
        );

        alert(
          "Failed to post comment."
        );
      }
    }
  );
}

// =========================================
// LOAD COMMENTS
// =========================================

function loadComments() {
  if (!commentList) {
    return;
  }

  db.collection("comments")
    .orderBy(
      "timestamp",
      "desc"
    )
    .onSnapshot(
      (snapshot) => {

        commentList.innerHTML = "";

        // No comments

        if (snapshot.empty) {
          commentList.innerHTML = `
            <p
              class="comment-text"
              style="margin:0;color:#a7b0d6;"
            >
              No comments yet. Be the first to post.
            </p>
          `;

          return;
        }

        // Display comments

        snapshot.forEach((doc) => {
          const commentData =
            doc.data();

          const commentId =
            doc.id;

          const timestamp =
            commentData.timestamp
              ? new Date(
                  commentData.timestamp.toDate()
                ).toLocaleString()
              : "Just now";

          const commentElement =
            document.createElement("div");

          commentElement.classList.add(
            "comment"
          );

          commentElement.innerHTML = `
            <div class="comment-header">
              <span class="comment-user">
                ${escapeHTML(
                  commentData.username ||
                  "Anonymous"
                )}
              </span>

              <span class="comment-time">
                ${timestamp}
              </span>
            </div>

            <p class="comment-text">
              ${escapeHTML(
                commentData.comment || ""
              )}
            </p>

            <div class="comment-actions">

              <button
                class="like-btn"
                type="button"
                onclick="likeComment('${commentId}')"
              >
                👍 Like
              </button>

              <span class="likes-count">
                Likes:
                <span id="likes-${commentId}">
                  ${commentData.likes || 0}
                </span>
              </span>

            </div>
          `;

          commentList.appendChild(
            commentElement
          );
        });
      },

      (error) => {
        console.error(
          "Error loading comments:",
          error
        );

        commentList.innerHTML = `
          <p
            class="comment-text"
            style="margin:0;color:#ff9c9c;"
          >
            Failed to load comments.
          </p>
        `;
      }
    );
}

// =========================================
// LIKE COMMENT
// =========================================

async function likeComment(
  commentId
) {
  const commentRef =
    db.collection("comments")
      .doc(commentId);

  try {
    await db.runTransaction(
      async (transaction) => {

        const doc =
          await transaction.get(
            commentRef
          );

        if (!doc.exists) {
          return;
        }

        const currentLikes =
          doc.data().likes || 0;

        const newLikes =
          currentLikes + 1;

        transaction.update(
          commentRef,
          {
            likes: newLikes
          }
        );
      }
    );

  } catch (error) {
    console.error(
      "Error liking comment:",
      error
    );

    alert(
      "Failed to like comment."
    );
  }
}

// =========================================
// ESCAPE HTML
// =========================================

function escapeHTML(str) {
  return String(str)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

// =========================================
// LOGIN MODAL
// =========================================

function openModal() {
  if (loginModal) {
    loginModal.style.display =
      "block";
  }
}

function closeModal() {
  if (loginModal) {
    loginModal.style.display =
      "none";
  }
}

// =========================================
// SIGNUP MODAL
// =========================================

function showSignup() {
  closeModal();

  if (signupModal) {
    signupModal.style.display =
      "block";
  }
}

function closeSignupModal() {
  if (signupModal) {
    signupModal.style.display =
      "none";
  }
}

function switchToLogin() {
  closeSignupModal();

  openModal();
}

// =========================================
// CLOSE MODALS WHEN CLICKING OUTSIDE
// =========================================

window.addEventListener(
  "click",
  (e) => {

    if (
      e.target === loginModal
    ) {
      closeModal();
    }

    if (
      e.target === signupModal
    ) {
      closeSignupModal();
    }
  }
);

// =========================================
// ESC KEY CLOSES MODALS
// =========================================

window.addEventListener(
  "keydown",
  (e) => {

    if (e.key !== "Escape") {
      return;
    }

    closeModal();
    closeSignupModal();
  }
);

// =========================================
// MOVING STARFIELD
// =========================================

function initStarfield() {
  const canvas =
    document.getElementById(
      "starfield"
    );

  if (!canvas) {
    return;
  }

  const ctx =
    canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let stars = [];

  // =======================================
  // RESIZE CANVAS
  // =======================================

  function resizeCanvas() {
    width =
      canvas.width =
        window.innerWidth;

    height =
      canvas.height =
        window.innerHeight;

    const starCount =
      Math.max(
        80,
        Math.floor(
          (width * height) /
          12000
        )
      );

    stars =
      Array.from(
        {
          length: starCount
        },
        () => ({
          x:
            Math.random() *
            width,

          y:
            Math.random() *
            height,

          speed:
            Math.random() *
              0.45 +
            0.12,

          radius:
            Math.random() *
              1.6 +
            0.2,

          alpha:
            Math.random() *
              0.75 +
            0.2
        })
      );
  }

  // =======================================
  // DRAW FRAME
  // =======================================

  function drawFrame() {
    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    for (const star of stars) {

      star.y +=
        star.speed;

      // Reset star when it leaves screen

      if (
        star.y >
        height + 2
      ) {
        star.y = -2;

        star.x =
          Math.random() *
          width;
      }

      ctx.beginPath();

      ctx.arc(
        star.x,
        star.y,
        star.radius,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        `rgba(220, 230, 255, ${star.alpha})`;

      ctx.fill();
    }

    requestAnimationFrame(
      drawFrame
    );
  }

  // Start

  resizeCanvas();

  drawFrame();

  // Resize with window

  window.addEventListener(
    "resize",
    resizeCanvas
  );
}

// =========================================
// INITIALIZE PAGE
// =========================================

loadComments();

initStarfield();
```
