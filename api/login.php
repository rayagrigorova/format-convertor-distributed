<?php
/**
 * login.php
 * 
 * This script handles user login.
 * It expects a JSON payload containing `email` and `password`.
 * If the credentials match a user in the database, a session is started and the user is logged in.
 * Responds with JSON indicating success or failure.
 */

require __DIR__.'/db.php'; // Include the database connection and start session

// Log script name, session ID, and current user ID (if any) for debugging
error_log(__FILE__.' '.session_id().' uid='.($_SESSION['uid']??'¬'));

// Decode JSON input from the request body
$data = json_decode(file_get_contents('php://input'), true);

// Extract and trim email and password values (use empty strings as default fallback)
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

// Prepare and execute a query to look up the user by email
$stmt = $pdo->prepare('SELECT id,password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);

// Fetch the matching user (if any)
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// If user exists and password is correct, log them in
if ($user && password_verify($password, $user['password_hash'])) {
    session_regenerate_id(true); // Regenerate session ID for security (prevents session fixation)
    $_SESSION['uid'] = $user['id']; // Store user ID in session
    echo json_encode(['ok' => true]); // Respond with success
} else {
    // If login fails, send 401 Unauthorized and error messag
    http_response_code(401);
    echo json_encode(['error' => 'Грешен e-mail или парола.']);
}
