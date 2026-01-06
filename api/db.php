<?php
/**
 * db.php
 * 
 * This file sets up and opens a connection to the MySQL database used by the converter site.
 * It is included in other scripts that need to read from or write to the database (e.g. saving user conversions, settings, or history).
 * 
 * On failure, it returns a 500 error and a JSON response.
 */

// Start the session to manage user authentication or settings across requests
session_start();

// Set the response content type to JSON (for API responses)
header('Content-Type: application/json');

try {
    // Attempt to create a new PDO (PHP Data Object) connection to the MySQL database
    $pdo = new PDO(
        'mysql:host=localhost;dbname=converter;charset=utf8mb4', // DB host, name, and charset
        'root', // MySQL username
        '', // MySQL password (empty for local dev, not recommended for production)
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION] // Set PDO to throw exceptions on errors
    );
} catch (PDOException $e) {
    // If connection fails, return a 500 error and JSON error message
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}
