package services

import (
	"encoding/binary"
	"io"
	"net"
	"os"
	"testing"
)

func runFakeClamd(t *testing.T, response string) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			return
		}
		defer conn.Close()
		command := make([]byte, len("zINSTREAM\x00"))
		_, _ = io.ReadFull(conn, command)
		for {
			var size [4]byte
			if _, readErr := io.ReadFull(conn, size[:]); readErr != nil {
				return
			}
			length := binary.BigEndian.Uint32(size[:])
			if length == 0 {
				break
			}
			_, _ = io.CopyN(io.Discard, conn, int64(length))
		}
		_, _ = conn.Write([]byte(response + "\x00"))
	}()
	return listener.Addr().String()
}

func TestScanFileAcceptsCleanAndRejectsMalware(t *testing.T) {
	path := t.TempDir() + "/upload.txt"
	if err := os.WriteFile(path, []byte("safe content"), 0600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("CLAMAV_ADDR", runFakeClamd(t, "stream: OK"))
	if err := ScanFile(path); err != nil {
		t.Fatalf("clean upload rejected: %v", err)
	}

	t.Setenv("CLAMAV_ADDR", runFakeClamd(t, "stream: Eicar-Signature FOUND"))
	if err := ScanFile(path); err != ErrMalwareDetected {
		t.Fatalf("expected malware sentinel, got %v", err)
	}
}
