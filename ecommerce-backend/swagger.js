const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'HAFIZ GAS APPLIANCES API',
    version: '2.0.0',
    description: 'PostgreSQL-backed e-commerce API. Admin routes require a Bearer JWT.'
  },
  servers: [{ url: 'http://https://hafiz-gas-appliances.onrender.com' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'API and database health',
        responses: {
          200: { description: 'Healthy' },
          503: { description: 'Database unavailable' }
        }
      }
    },

    '/api/auth/register': {
      post: {
        summary: 'Register a customer',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'phone', 'password', 'confirmPassword'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  confirmPassword: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Registered' },
          400: { description: 'Validation error' }
        }
      }
    },

    '/api/auth/login': {
  post: {
    summary: 'Admin or customer login',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: {
                type: 'string',
                format: 'email',
                example: 'hafizgastandoors@gmail.com'
              },
              password: {
                type: 'string',
                format: 'password',
                example: 'Enter your password'
              }
            }
          }
        }
      }
    },
    responses: {
      200: { description: 'Login successful; token and user returned' },
      400: { description: 'Email and password required' },
      401: { description: 'Invalid email or password' }
    }
  }
},

    '/api/auth/me': {
      get: {
        summary: 'Current account',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current user' }
        }
      }
    },

    '/api/products': {
      get: {
        summary: 'List/search/filter products',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['newest', 'price_asc', 'price_desc', 'title']
            }
          }
        ],
        responses: {
          200: { description: 'Paginated product list' }
        }
      },
      post: {
        summary: 'Create product (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'sku', 'description', 'price'],
                properties: {
                  title: { type: 'string' },
                  sku: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  stock: { type: 'integer', minimum: 0, default: 0 },
                  image_url: { type: 'string', nullable: true },
                  images: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  category: { type: 'string' },
                  is_published: { type: 'integer', enum: [0, 1] }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Created' },
          401: { description: 'Authentication required' },
          403: { description: 'Admin access required' }
        }
      }
    },

    '/api/products/{id}': {
      get: {
        summary: 'Get product detail',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          200: { description: 'Product' },
          404: { description: 'Not found' }
        }
      },
      put: {
        summary: 'Update product (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  sku: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  stock: { type: 'integer', minimum: 0 },
                  image_url: { type: 'string', nullable: true },
                  images: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  category: { type: 'string' },
                  is_published: { type: 'integer', enum: [0, 1] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Updated' },
          401: { description: 'Authentication required' },
          403: { description: 'Admin access required' }
        }
      },
      delete: {
        summary: 'Delete product (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          200: { description: 'Deleted' },
          401: { description: 'Authentication required' },
          403: { description: 'Admin access required' }
        }
      }
    },

    '/api/orders': {
      post: {
        summary: 'Create order; optional Idempotency-Key header',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['product_id', 'quantity'],
                      properties: {
                        product_id: { type: 'integer' },
                        quantity: { type: 'integer', minimum: 1 },
                        selected_options: { type: 'object' }
                      }
                    }
                  },
                  customer_name: { type: 'string' },
                  customer_email: { type: 'string', format: 'email' },
                  customer_phone: { type: 'string' },
                  shipping_address: { type: 'string' },
                  notes: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Order created' },
          400: { description: 'Validation error' },
          401: { description: 'Authentication required' },
          409: { description: 'Stock conflict' }
        }
      }
    },

    '/api/orders/my-orders': {
      get: {
        summary: 'Current customer orders',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Orders' }
        }
      }
    },

    '/api/orders/{id}': {
      get: {
        summary: 'Get own order or admin order',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          200: { description: 'Order' },
          403: { description: 'Forbidden' }
        }
      }
    },

    '/api/products/{productId}/reviews': {
      post: {
        summary: 'Create product review',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rating', 'comment'],
                properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  comment: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Review created' }
        }
      }
    },

    '/api/contact': {
      post: {
        summary: 'Submit contact form',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'subject', 'message'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  subject: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Message received' },
          400: { description: 'Validation error' }
        }
      }
    },

    '/api/admin/dashboard-stats': {
      get: {
        summary: 'Dashboard statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Statistics' }
        }
      }
    },

    '/api/admin/orders': {
      get: {
        summary: 'List orders (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Paginated orders' }
        }
      }
    },

    '/api/admin/orders/{id}/status': {
      put: {
        summary: 'Update order status (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: [
                      'pending',
                      'confirmed',
                      'processing',
                      'shipped',
                      'delivered',
                      'cancelled'
                    ]
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Status updated' },
          409: { description: 'Invalid transition' }
        }
      }
    },

    '/api/admin/contacts': {
      get: {
        summary: 'List contact messages (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Messages' }
        }
      }
    },

    '/api/admin/contacts/{id}/status': {
      patch: {
        summary: 'Update contact message status (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['new', 'read', 'replied', 'closed']
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Updated' }
        }
      }
    },

    '/api/admin/uploads': {
      post: {
        summary: 'Upload up to 8 images using multipart field images (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['images'],
                properties: {
                  images: {
                    type: 'array',
                    maxItems: 8,
                    items: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Uploaded image URLs' }
        }
      }
    }
  }
};

export default swaggerSpec;