<?php
/**
 * logout.php
 * 
 * This script logs out the currently authenticated user by destroying the session.
 * It returns a JSON response confirming the logout.
 */

require __DIR__.'/db.php'; // Include the database setup (also ensures session is started)

// Destroy the current session and remove all session data
session_destroy();

// Respond with a success message in JSON format
echo json_encode(['ok' => true]);
