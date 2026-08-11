package services

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// AllowPrivateOutbound is an explicit development-only escape hatch for local
// n8n/MinIO services. Production never permits user-configured requests to
// reach loopback, RFC1918, link-local, or metadata addresses.
func AllowPrivateOutbound() bool {
	return os.Getenv("APP_ENV") == "development" && os.Getenv("ALLOW_PRIVATE_OUTBOUND") == "true"
}

func safeIP(ip net.IP) bool {
	if AllowPrivateOutbound() {
		return true
	}
	return !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast())
}

func resolvePublicHost(host string) error {
	if host == "" {
		return fmt.Errorf("outbound URL has no host")
	}
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if !AllowPrivateOutbound() && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
		return fmt.Errorf("private host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if !safeIP(ip) {
			return fmt.Errorf("private IP is not allowed")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("could not resolve outbound host")
	}
	for _, ip := range ips {
		if !safeIP(ip) {
			return fmt.Errorf("outbound host resolves to a private address")
		}
	}
	return nil
}

// ValidateOutboundURL validates a user/workflow-configured destination before
// a request is made. HTTPS is required outside explicit development mode.
func ValidateOutboundURL(raw string) error {
	u, err := url.ParseRequestURI(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil {
		return fmt.Errorf("invalid outbound URL")
	}
	if u.Scheme != "https" && !(AllowPrivateOutbound() && u.Scheme == "http") {
		return fmt.Errorf("outbound URL must use HTTPS")
	}
	return resolvePublicHost(u.Hostname())
}

// NewSafeHTTPClient disables redirects and pins each dial to an address that
// passes the same private-network check. This closes the common redirect and
// DNS-rebinding variants of SSRF for workflow and integration calls.
func NewSafeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: timeout}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.LookupIP(host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if !safeIP(ip) {
					continue
				}
				conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if err == nil {
					return conn, nil
				}
			}
			return nil, fmt.Errorf("no permitted address for outbound host")
		},
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			if err := ValidateOutboundURL(req.URL.String()); err != nil {
				return err
			}
			return http.ErrUseLastResponse
		},
	}
}

// NewInternalHTTPClient is only for a fixed service-to-service destination
// chosen by deployment configuration, never for a URL supplied by a tenant.
// It deliberately permits the private Docker network while pinning production
// traffic to the expected service DNS name and refusing redirects.
func NewInternalHTTPClient(rawURL, productionHost string, timeout time.Duration) (*http.Client, error) {
	u, err := url.ParseRequestURI(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil {
		return nil, fmt.Errorf("invalid internal service URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("invalid internal service scheme")
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	expected := strings.TrimSuffix(strings.ToLower(productionHost), ".")
	if os.Getenv("APP_ENV") == "production" && host != expected {
		return nil, fmt.Errorf("internal service host must be %s", expected)
	}
	if os.Getenv("APP_ENV") != "production" &&
		host != expected && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return nil, fmt.Errorf("untrusted internal service host")
	}
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}
