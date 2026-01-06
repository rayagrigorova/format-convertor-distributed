<?php
/**
 * register.php
 * 
 * This script handles user registration.
 * It expects a JSON payload with `email` and `password`.
 * It validates the input, checks if the email already exists,
 * hashes the password, saves the new user, and starts a session.
 * Returns a JSON response with success or error message.
 */

require __DIR__.'/db.php'; // Include database connection and start session

// Read and decode the raw JSON input from the request body
$data = json_decode(file_get_contents('php://input'), true);

// Extract and trim email and password; default to empty strings if not set
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

// Validate email format and minimum password length
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
    http_response_code(422); // Unprocessable Entity
    echo json_encode(['error' => 'Невалиден e-mail или прекалено къса парола (мин. 6).']);
    exit;
}

// Check if a user with this email already exists
$stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    http_response_code(409); // Conflict
    echo json_encode(['error' => 'Този e-mail вече съществува.']);
    exit;
}

// Hash the password using a secure algorithm (default = bcrypt)
$hash = password_hash($password, PASSWORD_DEFAULT);

// Insert the new user into the database
$pdo->prepare('INSERT INTO users (email,password_hash) VALUES (?,?)')
    ->execute([$email, $hash]);

// Store the new user's ID in the session and regenerate session ID for security
$_SESSION['uid'] = $pdo->lastInsertId();
session_regenerate_id(true);

// Respond with success
echo json_encode(['ok' => true]);
