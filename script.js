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

    // Get the username and comment
    const username = usernameInput.value;
    const commentText = commentTextInput.value;

    // Save the comment to Firestore
    try {
        await db.collection("comments").add({
            username: username,
            comment: commentText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear the form after submitting
        usernameInput.value = "";
        commentTextInput.value = "";
    } catch (error) {
        console.error("Error adding comment: ", error);
    }
});

// Fetch and display comments from Firestore
const loadComments = () => {
    db.collection("comments")
        .orderBy("timestamp", "desc")  // Order by timestamp (newest first)
        .onSnapshot((snapshot) => {
            commentList.innerHTML = "";  // Clear the comment list

            snapshot.forEach(doc => {
                const commentData = doc.data();
                const commentElement = document.createElement("div");
                commentElement.classList.add("comment");

                commentElement.innerHTML = `
                    <strong>${commentData.username}</strong>
                    <p>${commentData.comment}</p>
                `;

                commentList.appendChild(commentElement);
            });
        });
};

// Load comments on page load
loadComments();

