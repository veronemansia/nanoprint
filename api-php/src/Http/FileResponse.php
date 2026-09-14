<?php

declare(strict_types=1);

namespace NanoPrint\Http;

final class FileResponse
{
    public static function send(string $path, string $name, string $mime): never
    {
        if (!is_file($path) || !is_readable($path)) {
            JsonResponse::error(404, 'not_found', 'Le contenu du fichier est introuvable. Déposez-le à nouveau.');
        }
        $filename = str_replace(["\r", "\n", '"'], '', $name) ?: 'fichier';
        $ascii = preg_replace('/[^\x20-\x7E]/', '_', $filename) ?: 'fichier';
        header('Content-Type: ' . $mime);
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . (string) filesize($path));
        header(
            'Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($filename),
        );
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }
}
