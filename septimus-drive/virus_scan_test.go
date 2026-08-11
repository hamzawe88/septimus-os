package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"testing"
)

func fakeClamd(t *testing.T, response string) string {
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

func TestScanUploadFailsClosedAndRewinds(t *testing.T) {
	content := []byte("safe drive content")
	reader := bytes.NewReader(content)
	t.Setenv("CLAMAV_ADDR", fakeClamd(t, "stream: OK"))
	if err := scanUpload(reader); err != nil {
		t.Fatalf("clean upload rejected: %v", err)
	}
	remaining, _ := io.ReadAll(reader)
	if !bytes.Equal(remaining, content) {
		t.Fatal("scanner did not rewind upload stream")
	}

	t.Setenv("CLAMAV_ADDR", fakeClamd(t, "stream: Eicar-Signature FOUND"))
	if err := scanUpload(bytes.NewReader(content)); err != errMalwareDetected {
		t.Fatalf("expected malware sentinel, got %v", err)
	}
}
