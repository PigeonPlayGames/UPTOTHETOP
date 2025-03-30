// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.firebasestorage.app",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Get DOM elements for the form and comment list
const commentForm = document.getElementById("commentForm");
const usernameInput = document.getElementById("username");
const commentTextInput = document.getElementById("commentText");
const commentList = document.getElementById("commentList");

// Handle comment form submission
commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();  // Prevent form from refreshing the page

    const username = usernameInput.value;
    const commentText = commentTextInput.value;

    try {
        await db.collection("comments").add({
            username: username,
            comment: commentText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Adds timestamp
            likes: 0 // Initializes likes to 0
        });

        // Clear form
        usernameInput.value = "";
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
            commentList.innerHTML = "";  // Clear comment list

            snapshot.forEach(doc => {
                const commentData = doc.data();
                const commentId = doc.id;  // Get the document ID
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
                    <button onclick="likeComment('${commentId}')">Like</button>  <!-- Like button -->
                `;

                commentList.appendChild(commentElement);
            });
        });
};


// Load comments on page load
loadComments();

const likeComment = async (commentId) => {
    const commentRef = db.collection("comments").doc(commentId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(commentRef);
            if (!doc.exists) return;

            const newLikes = (doc.data().likes || 0) + 1;
            transaction.update(commentRef, { likes: newLikes });

            // Update the like count in the UI
            document.getElementById(`likes-${commentId}`).textContent = newLikes;
        });
    } catch (error) {
        console.error("Error liking comment: ", error);
    }
};


