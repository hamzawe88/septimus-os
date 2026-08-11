package handlers

import (
	"errors"
	"net/url"
	"os"
	"strings"
)

func frontendPublicBaseURL() (*url.URL, error) {
	raw := strings.TrimSpace(os.Getenv("FRONTEND_PUBLIC_URL"))
	if raw == "" {
		raw = "http://localhost:3000"
	}
	base, err := url.Parse(raw)
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil {
		return nil, errors.New("FRONTEND_PUBLIC_URL must be an absolute HTTP(S) URL")
	}
	if base.Scheme != "http" && base.Scheme != "https" {
		return nil, errors.New("FRONTEND_PUBLIC_URL must use HTTP(S)")
	}
	base.RawQuery = ""
	base.Fragment = ""
	return base, nil
}

func safeFrontendURL(candidate, defaultPath string) (string, error) {
	base, err := frontendPublicBaseURL()
	if err != nil {
		return "", err
	}
	if candidate == "" {
		target := *base
		target.Path = defaultPath
		return target.String(), nil
	}

	target, err := url.Parse(candidate)
	if err != nil || target.User != nil || target.Host != "" && !target.IsAbs() {
		return "", errors.New("invalid return URL")
	}
	if !target.IsAbs() {
		if !strings.HasPrefix(target.Path, "/") || strings.HasPrefix(target.Path, "//") {
			return "", errors.New("return URL must be root-relative")
		}
		return base.ResolveReference(target).String(), nil
	}
	if !strings.EqualFold(target.Scheme, base.Scheme) ||
		!strings.EqualFold(target.Host, base.Host) {
		return "", errors.New("return URL origin is not allowed")
	}
	return target.String(), nil
}
