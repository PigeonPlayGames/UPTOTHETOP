// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// 🔹 Handle UI updates when user logs in/out
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById("login-btn").style.display = "none";
        document.getElementById("logout-btn").style.display = "inline-block";
    } else {
        document.getElementById("login-btn").style.display = "inline-block";
        document.getElementById("logout-btn").style.display = "none";
    }
});

// 🔹 Handle Login
document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            alert("Login successful!");
            closeModal();
        })
        .catch((error) => {
            alert(error.message);
        });
});

// 🔹 Handle Signup
document.getElementById("signup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
            alert("Sign-up successful!");
            closeSignupModal();
        })
        .catch((error) => {
            alert(error.message);
        });
});

// 🔹 Handle Logout
function logout() {
    auth.signOut().then(() => {
        alert("Logged out!");
    }).catch((error) => {
        alert(error.message);
    });
}

// 🔹 Comment System
const commentForm = document.getElementById("commentForm");
const usernameInput = document.getElementById("username");
const commentTextInput = document.getElementById("commentText");
const commentList = document.getElementById("commentList");

// Handle comment submission
commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert("You must be logged in to comment!");
        return;
    }

    const username = user.email; // Use logged-in user's email as username
    const commentText = commentTextInput.value;

    try {
        await db.collection("comments").add({
            username: username,
            comment: commentText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            likes: 0
        });

        usernameInput.value = "";
        commentTextInput.value = "";
    } catch (error) {
        console.error("Error adding comment: ", error);
    }
});

// Load comments
const loadComments = () => {
    db.collection("comments")
        .orderBy("timestamp", "desc")
        .onSnapshot((snapshot) => {
            commentList.innerHTML = "";

            snapshot.forEach(doc => {
                const commentData = doc.data();
                const commentId = doc.id;
                const timestamp = commentData.timestamp
                    ? new Date(commentData.timestamp.toDate()).toLocaleString()
                    : "Just now";
                
                const commentElement = document.createElement("div");
                commentElement.classList.add("comment");

                commentElement.innerHTML = `
                    <strong>${commentData.username}</strong>
                    <p>${commentData.comment}</p>
                    <small>${timestamp}</small>
                    <p>👍 Likes: <span id="likes-${commentId}">${commentData.likes || 0}</span></p>
                    <button onclick="likeComment('${commentId}')">Like</button>
                `;

                commentList.appendChild(commentElement);
            });
        });
};

loadComments();

// Handle Likes
const likeComment = async (commentId) => {
    const commentRef = db.collection("comments").doc(commentId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(commentRef);
            if (!doc.exists) return;

            const newLikes = (doc.data().likes || 0) + 1;
            transaction.update(commentRef, { likes: newLikes });

            document.getElementById(`likes-${commentId}`).textContent = newLikes;
        });
    } catch (error) {
        console.error("Error liking comment: ", error);
    }
};

// 🔹 Modal Functions
function openModal() { document.getElementById("login-modal").style.display = "block"; }
function closeModal() { document.getElementById("login-modal").style.display = "none"; }
function showSignup() { closeModal(); document.getElementById("signup-modal").style.display = "block"; }
function closeSignupModal() { document.getElementById("signup-modal").style.display = "none"; }
