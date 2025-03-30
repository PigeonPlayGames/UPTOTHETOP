// 🔥 Firebase Configuration
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

// 🔹 Handle UI Updates Based on Authentication State
auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById("login-btn").style.display = "none";
        document.getElementById("logout-btn").style.display = "inline-block";

        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
            document.getElementById("welcome-user").textContent = `Welcome, ${userDoc.data().username}!`;
        }
    } else {
        document.getElementById("login-btn").style.display = "inline-block";
        document.getElementById("logout-btn").style.display = "none";
        document.getElementById("welcome-user").textContent = "";
    }
});

// 🔹 Handle Signup
document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("signup-username").value.toLowerCase();
    const password = document.getElementById("signup-password").value;
    
    if (!username || username.includes("@")) {
        alert("Invalid username!");
        return;
    }

    const fakeEmail = `${username}@uptothetop.com`;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(fakeEmail, password);
        await db.collection("users").doc(userCredential.user.uid).set({ username: username });
        alert("Sign-up successful!");
        closeSignupModal();
    } catch (error) {
        alert(error.message);
    }
});

// 🔹 Handle Login
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.toLowerCase();
    const password = document.getElementById("login-password").value;

    try {
        // 🔥 Get the correct email linked to this username
        const usersSnapshot = await db.collection("users").where("username", "==", username).get();

        if (usersSnapshot.empty) {
            alert("Username not found!");
            return;
        }

        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const fakeEmail = `${username}@uptothetop.com`; // Ensure it's consistent

        await auth.signInWithEmailAndPassword(fakeEmail, password);
        alert("Login successful!");
        closeModal();
    } catch (error) {
        alert(error.message);
    }
});

// 🔹 Handle Logout
function logout() {
    auth.signOut().then(() => alert("Logged out!"));
}

// 🔥 COMMENT SYSTEM 🔥

// Get DOM elements for the form and comment list
const commentForm = document.getElementById("commentForm");
const commentTextInput = document.getElementById("commentText");
const commentList = document.getElementById("commentList");

// Handle comment form submission
commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert("You must be logged in to comment!");
        return;
    }

    const userDoc = await db.collection("users").doc(user.uid).get();
    const username = userDoc.exists ? userDoc.data().username : "Anonymous";
    const commentText = commentTextInput.value;

    try {
        await db.collection("comments").add({
            username: username,
            comment: commentText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            likes: 0,
            likedBy: [] // Track likes by user ID
        });

        commentTextInput.value = "";
    } catch (error) {
        console.error("Error adding comment: ", error);
    }
});

// Fetch and display comments from Firestore
const loadComments = () => {
    db.collection("comments")
        .orderBy("timestamp", "desc")
        .onSnapshot((snapshot) => {
            commentList.innerHTML = ""; // Clear comment list

            snapshot.forEach(doc => {
                const commentData = doc.data();
                const commentId = doc.id; // Get the document ID
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

// Load comments on page load
loadComments();

// Like Comment Function
const likeComment = async (commentId) => {
    const user = auth.currentUser;
    if (!user) {
        alert("You must be logged in to like a comment!");
        return;
    }

    const commentRef = db.collection("comments").doc(commentId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(commentRef);
            if (!doc.exists) return;

            let commentData = doc.data();
            let likedBy = commentData.likedBy || [];

            if (likedBy.includes(user.uid)) {
                alert("You have already liked this comment!");
                return;
            }

            likedBy.push(user.uid); // Add user ID to likedBy array

            transaction.update(commentRef, { 
                likes: (commentData.likes || 0) + 1,
                likedBy: likedBy // Update likedBy array in Firestore
            });

            document.getElementById(`likes-${commentId}`).textContent = (commentData.likes || 0) + 1;
        });
    } catch (error) {
        console.error("Error liking comment: ", error);
    }
};
