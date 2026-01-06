<?php
/**
 * me.php
 * 
 * This script returns basic information about the currently logged-in user.
 * It is used to verify authentication status and fetch the user's email and ID.
 * Responds with a JSON object or 401 Unauthorized if the user is not logged in.
 */

require __DIR__.'/db.php'; // Include the database connection and start session

// Check if the user is logged in (session contains a user ID)
if (!isset($_SESSION['uid'])) {
    http_response_code(401); // Unauthorized
    echo json_encode(['error' => 'unauthenticated']);
    exit;
}

// Prepare a SQL query to fetch the user's email and ID
$stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = ?');
$stmt->execute([$_SESSION['uid']]);

// Fetch user data and return it as JSON
$user = $stmt->fetch(PDO::FETCH_ASSOC);
echo json_encode($user);
