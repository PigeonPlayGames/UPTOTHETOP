// Firebase Authentication UI Elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const logoutButton = document.getElementById("logoutButton");
const userStatus = document.getElementById("userStatus");

// Handle User Signup
signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            alert("Signup successful! You can now log in.");
            signupForm.reset();
        })
        .catch((error) => {
            console.error("Error signing up:", error.message);
            alert(error.message);
        });
});

// Handle User Login
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            alert("Login successful!");
            loginForm.reset();
        })
        .catch((error) => {
            console.error("Error logging in:", error.message);
            alert(error.message);
        });
});

// Handle User Logout
logoutButton.addEventListener("click", () => {
    firebase.auth().signOut().then(() => {
        alert("Logged out successfully!");
    }).catch((error) => {
        console.error("Error logging out:", error.message);
    });
});

// Detect Auth State Changes
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        userStatus.innerHTML = `Logged in as: ${user.email}`;
        logoutButton.style.display = "block";  // Show logout button
    } else {
        userStatus.innerHTML = "Not logged in";
        logoutButton.style.display = "none";  // Hide logout button
    }
});
