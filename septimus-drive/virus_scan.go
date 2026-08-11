package main

import (
	"bufio"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"
)

var errMalwareDetected = errors.New("malware detected")

func scannerHealthy() bool {
	address := strings.TrimSpace(os.Getenv("CLAMAV_ADDR"))
	if address == "" {
		return false
	}
	conn, err := net.DialTimeout("tcp", address, 2*time.Second)
	if err != nil {
		return false
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := conn.Write([]byte("zPING\x00")); err != nil {
		return false
	}
	response, err := bufio.NewReader(io.LimitReader(conn, 64)).ReadString('\x00')
	return err == nil && strings.Contains(response, "PONG")
}

func scanUpload(reader io.ReadSeeker) error {
	address := strings.TrimSpace(os.Getenv("CLAMAV_ADDR"))
	if address == "" {
		return fmt.Errorf("malware scanner is not configured")
	}
	if _, err := reader.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("rewind upload for malware scan: %w", err)
	}
	defer reader.Seek(0, io.SeekStart)

	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return fmt.Errorf("connect to malware scanner: %w", err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Minute))
	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		return fmt.Errorf("start malware scan: %w", err)
	}
	buffer := make([]byte, 64*1024)
	for {
		n, readErr := reader.Read(buffer)
		if n > 0 {
			var size [4]byte
			binary.BigEndian.PutUint32(size[:], uint32(n))
			if _, err := conn.Write(size[:]); err != nil {
				return fmt.Errorf("stream malware scan size: %w", err)
			}
			if _, err := conn.Write(buffer[:n]); err != nil {
				return fmt.Errorf("stream malware scan data: %w", err)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("read upload for malware scan: %w", readErr)
		}
	}
	if _, err := conn.Write([]byte{0, 0, 0, 0}); err != nil {
		return fmt.Errorf("finish malware scan: %w", err)
	}
	response, err := bufio.NewReader(io.LimitReader(conn, 4096)).ReadString('\x00')
	if err != nil && err != io.EOF {
		return fmt.Errorf("read malware scan result: %w", err)
	}
	switch {
	case strings.Contains(response, " FOUND"):
		return errMalwareDetected
	case strings.Contains(response, " OK"):
		return nil
	default:
		return fmt.Errorf("malware scanner returned an invalid result")
	}
}
